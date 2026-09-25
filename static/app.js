/* Genius Video AI — frontend.
 * Storyboard + frames are generated directly from the browser via Pollinations
 * (free, keyless, CORS-enabled). If it is unreachable we fall back to a local
 * template storyboard and the server's offline procedural artist.
 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const STYLES = {
  "🎥 Кино": "cinematic film still, dramatic lighting, anamorphic lens, shallow depth of field, highly detailed, 35mm",
  "📷 Фото": "ultra realistic photograph, natural light, 8k, sharp focus, professional photography",
  "🌸 Аниме": "anime key visual, studio ghibli style, vibrant colors, beautiful detailed background",
  "🧸 3D мульт": "3D pixar style render, cute, soft global illumination, octane render, vibrant",
  "🎨 Акварель": "delicate watercolor painting, soft washes, paper texture, artistic",
  "🌃 Киберпанк": "cyberpunk, neon lights, rain, blade runner atmosphere, moody, highly detailed",
  "🐉 Фэнтези": "epic fantasy concept art, magical atmosphere, volumetric light, matte painting",
  "🕹️ Пиксель-арт": "detailed pixel art, 16-bit, retro game aesthetic",
};
const SHOTS = [
  "establishing wide shot of", "medium shot of", "dramatic close-up of", "low angle heroic shot of",
  "aerial view of", "over-the-shoulder shot of", "silhouette at golden hour of", "final epic wide shot of",
];
const SIZES = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1024, 1024], "4:5": [864, 1080] };

const state = { mode: "idea", style: Object.keys(STYLES)[0], scenes: [], seed: rnd(), busy: false };
let uid = 0;

function rnd() { return Math.floor(Math.random() * 1e9); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function fetchTimeout(url, ms, opts = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(t); }
}
const settings = () => ({
  aspect: $("#aspect").value, scene_duration: +$("#dur").value || 4, motion: $("#motion").value,
  transition: $("#transition").value, grade: $("#grade").value, music: $("#music").value,
  fps: +$("#fps").value, captions: $("#captions").checked, title: $("#title").value.trim(),
});

/* ---------------- UI setup ---------------- */
const stylesEl = $("#styles");
Object.keys(STYLES).forEach(name => {
  const b = document.createElement("button");
  b.className = "chip" + (name === state.style ? " active" : "");
  b.textContent = name;
  b.onclick = () => { state.style = name; $$(".chip", stylesEl).forEach(x => x.classList.toggle("active", x === b)); };
  stylesEl.appendChild(b);
});
$$(".chip.ex").forEach(b => b.onclick = () => { $("#prompt").value = b.textContent; $("#prompt").focus(); });
$$(".tab").forEach(t => t.onclick = () => {
  state.mode = t.dataset.mode;
  $$(".tab").forEach(x => x.classList.toggle("active", x === t));
  $(".mode-idea").classList.toggle("hidden", state.mode !== "idea");
  $(".mode-photos").classList.toggle("hidden", state.mode !== "photos");
  $("#btnStory").classList.toggle("hidden", state.mode !== "idea");
});
$("#music").onchange = e => $("#audioFile").classList.toggle("hidden", e.target.value !== "file");
$("#aspect").onchange = () => { $$(".thumb").forEach(applyAspect); };
function applyAspect(el) { el.style.aspectRatio = $("#aspect").value.replace(":", "/"); }

/* ---------------- storyboard ---------------- */
function extractJSON(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("no json");
  return JSON.parse(text.slice(s, e + 1));
}

async function aiStoryboard(idea, n) {
  const instr =
    `You are a genius film director. Create a storyboard for a short video about: "${idea}". ` +
    `Return ONLY JSON: {"title": string, "scenes": [{"caption": string, "prompt": string}]} with exactly ${n} scenes. ` +
    `"caption": one short evocative subtitle sentence in the SAME language as the idea (max 12 words). ` +
    `"prompt": a vivid detailed ENGLISH image-generation prompt for that shot (subject, action, setting, camera angle, lighting), ` +
    `keep the main character and setting visually consistent between scenes. Make a story with beginning, climax and ending.`;
  const url = `https://text.pollinations.ai/${encodeURIComponent(instr)}?json=true&seed=${state.seed}`;
  const r = await fetchTimeout(url, 35000);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const data = extractJSON(await r.text());
  const scenes = (data.scenes || []).filter(s => s && s.prompt).slice(0, n);
  if (!scenes.length) throw new Error("empty");
  return { title: String(data.title || ""), scenes };
}

function localStoryboard(idea, n) {
  let parts = idea.split(/(?<=[.!?…])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const scenes = [];
  for (let i = 0; i < n; i++) {
    const base = parts.length > 1 ? parts[i % parts.length] : idea;
    const shot = SHOTS[Math.round(i * (SHOTS.length - 1) / Math.max(1, n - 1))];
    scenes.push({ caption: parts.length > 1 ? base : (i === 0 ? idea : ""), prompt: `${shot} ${base}` });
  }
  return { title: "", scenes };
}

$("#btnStory").onclick = async () => {
  const idea = $("#prompt").value.trim();
  if (!idea) { $("#prompt").focus(); return flash("#storyStatus", "Сначала опишите идею 🙂"); }
  const n = Math.max(1, Math.min(12, +$("#nScenes").value || 5));
  const btn = $("#btnStory"); btn.disabled = true;
  state.seed = rnd();
  flash("#storyStatus", "🧠 ИИ-режиссёр пишет сценарий…");
  let story;
  try { story = await aiStoryboard(idea, n); flash("#storyStatus", "✅ Сценарий готов, рисую кадры…"); }
  catch (e) {
    console.warn("LLM unavailable:", e);
    story = localStoryboard(idea, n);
    flash("#storyStatus", "⚠️ ИИ-сценарист недоступен — использую шаблонную раскадровку. Рисую кадры…");
  }
  if (story.title && !$("#title").value.trim()) $("#title").value = story.title;
  state.scenes = story.scenes.map(s => newScene({ caption: s.caption || "", prompt: s.prompt }));
  showBoard();
  await generateAll();
  btn.disabled = false;
  flash("#storyStatus", "🎞️ Раскадровка готова — проверьте и жмите «Смонтировать видео»");
};

function newScene(o) { return { id: ++uid, caption: "", prompt: "", blob: null, url: "", source: "", seed: rnd(), ...o }; }

/* ---------------- image generation ---------------- */
async function genImage(sc) {
  sc.loading = true; renderScenes();
  const [w, h] = SIZES[$("#aspect").value] || SIZES["16:9"];
  const full = `${sc.prompt}, ${STYLES[state.style]}`;
  let blob = null, source = "";
  for (let attempt = 0; attempt < 2 && !blob; attempt++) {
    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=${w}&height=${h}&seed=${sc.seed + attempt}&nologo=true&model=flux`;
      const r = await fetchTimeout(url, 90000);
      if (r.ok && (r.headers.get("content-type") || "").startsWith("image")) { blob = await r.blob(); source = "ИИ"; }
      else if (r.status === 429) await sleep(6000);
    } catch (e) { console.warn("image gen failed", e); break; }
  }
  if (!blob) {
    const r = await fetch(`/api/procedural?prompt=${encodeURIComponent(sc.prompt + " " + sc.caption)}&w=${w}&h=${h}&seed=${sc.seed}`);
    blob = await r.blob(); source = "офлайн";
  }
  setBlob(sc, blob, source);
  sc.loading = false; renderScenes();
}
function setBlob(sc, blob, source) {
  if (sc.url) URL.revokeObjectURL(sc.url);
  sc.blob = blob; sc.url = URL.createObjectURL(blob); sc.source = source;
}
async function generateAll() {
  // sequential: the free tier prefers one request at a time
  for (const sc of state.scenes.slice()) if (state.scenes.includes(sc)) await genImage(sc);
}

/* ---------------- scene board ---------------- */
function showBoard() { $("#board").classList.remove("hidden"); $("#result").classList.add("hidden"); renderScenes(); $("#board").scrollIntoView({ behavior: "smooth" }); }

function renderScenes() {
  const box = $("#scenes"); box.innerHTML = "";
  state.scenes.forEach((sc, i) => {
    const el = $("#sceneTpl").content.firstElementChild.cloneNode(true);
    el.classList.toggle("loading", !!sc.loading);
    applyAspect($(".thumb", el));
    const img = $("img", el);
    if (sc.url) { img.src = sc.url; img.onload = () => img.classList.add("ok"); }
    $(".badge", el).textContent = sc.source ? (sc.source === "ИИ" ? "✨ ИИ" : sc.source === "фото" ? "🖼 фото" : "🎨 офлайн") : "";
    $(".num", el).textContent = i + 1;
    const cap = $(".caption", el); cap.value = sc.caption; cap.oninput = () => sc.caption = cap.value;
    const pr = $(".sprompt", el); pr.value = sc.prompt; pr.oninput = () => sc.prompt = pr.value;
    $(".regen", el).onclick = () => { if (!sc.prompt.trim()) sc.prompt = sc.caption || $("#prompt").value; sc.seed = rnd(); genImage(sc); };
    $(".del", el).onclick = () => { state.scenes.splice(state.scenes.indexOf(sc), 1); renderScenes(); };
    $(".left", el).onclick = () => move(i, -1);
    $(".right", el).onclick = () => move(i, 1);
    $(".up", el).onchange = e => { const f = e.target.files[0]; if (f) { setBlob(sc, f, "фото"); renderScenes(); } };
    box.appendChild(el);
  });
}
function move(i, d) {
  const j = i + d; if (j < 0 || j >= state.scenes.length) return;
  [state.scenes[i], state.scenes[j]] = [state.scenes[j], state.scenes[i]]; renderScenes();
}
$("#btnAdd").onclick = () => {
  const sc = newScene({ prompt: $("#prompt").value.trim() || "beautiful scenery" });
  state.scenes.push(sc); renderScenes(); genImage(sc);
};
$("#btnRegenAll").onclick = async () => { state.scenes.forEach(s => s.seed = rnd()); await generateAll(); };

/* photos mode */
function addPhotos(files) {
  const imgs = [...files].filter(f => f.type.startsWith("image/"));
  imgs.forEach(f => { const sc = newScene({ caption: "" }); setBlob(sc, f, "фото"); state.scenes.push(sc); });
  if (imgs.length) showBoard();
}
$("#photoInput").onchange = e => addPhotos(e.target.files);
const drop = $("#drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => addPhotos(e.dataTransfer.files));

/* ---------------- render ---------------- */
async function renderVideo() {
  const ready = state.scenes.filter(s => s.blob);
  if (!ready.length) return flash("#renderMsg", "Нет готовых кадров");
  if (state.scenes.some(s => s.loading)) return flash("#renderMsg", "Подождите, кадры ещё рисуются…", true);
  const cfg = { ...settings(), seed: rnd(), scenes: ready.map(s => ({ caption: s.caption })) };
  const fd = new FormData();
  fd.append("config", JSON.stringify(cfg));
  ready.forEach((s, i) => fd.append("images", s.blob, `scene${i}.img`));
  if (cfg.music === "file") {
    const f = $("#audioFile").files[0];
    if (f) fd.append("audio", f); else cfg.music = "none";
  }
  const btn = $("#btnRender"); btn.disabled = true;
  $("#renderBox").classList.remove("hidden"); $("#result").classList.add("hidden");
  setProgress(0, "Загружаю кадры на сервер…");
  try {
    const r = await fetch("/api/render", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || "Ошибка сервера");
    while (true) {
      await sleep(700);
      const s = await (await fetch(`/api/jobs/${j.job_id}`)).json();
      setProgress(s.progress, s.message);
      if (s.status === "done") { showResult(s.video); break; }
      if (s.status === "error") throw new Error(s.message);
    }
  } catch (e) { setProgress(0, "❌ " + e.message); }
  btn.disabled = false;
}
function setProgress(p, msg) { $("#barFill").style.width = Math.round(p * 100) + "%"; $("#renderMsg").textContent = msg || ""; }
function showResult(url) {
  $("#renderBox").classList.add("hidden");
  const v = $("#player"); v.src = url; $("#download").href = url;
  $("#result").classList.remove("hidden"); v.play().catch(() => {});
  $("#result").scrollIntoView({ behavior: "smooth", block: "center" });
  loadGallery();
}
$("#btnRender").onclick = renderVideo;
$("#btnAgain").onclick = renderVideo;

/* ---------------- gallery ---------------- */
async function loadGallery() {
  try {
    const items = await (await fetch("/api/videos")).json();
    const g = $("#galleryGrid");
    if (!items.length) { g.innerHTML = '<p class="hint">Здесь появятся ваши ролики.</p>'; return; }
    g.innerHTML = "";
    items.forEach(it => {
      const d = document.createElement("div"); d.className = "gitem";
      d.innerHTML = `<video src="${it.video}" poster="${it.poster}" controls preload="none"></video>
        <div class="meta"><span></span><div><a class="icon" href="${it.video}" download title="Скачать">⬇</a><button class="icon" title="Удалить">🗑</button></div></div>`;
      $("span", d).textContent = it.title || new Date(it.created * 1000).toLocaleString();
      $("button", d).onclick = async () => { if (confirm("Удалить видео?")) { await fetch(`/api/videos/${it.id}`, { method: "DELETE" }); loadGallery(); } };
      g.appendChild(d);
    });
  } catch (e) { console.warn(e); }
}

function flash(sel, msg) { $(sel).textContent = msg; }
loadGallery();
