/* Klavish — frontend (AI video studio).
 *
 * Flow: idea → storyboard (LLM) → keyframes (Flux) → AI clips per scene
 *       (Pollinations video / Runway Gen-4.5 via our server) → montage of exact length.
 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const STYLES = {
  "🎥 Кино": "cinematic film look, dramatic lighting, anamorphic lens, shallow depth of field, highly detailed, 35mm",
  "📷 Реализм": "ultra realistic, natural light, sharp focus, professional footage, 8k",
  "🌸 Аниме": "anime style, studio ghibli inspired, vibrant colors, beautiful detailed background",
  "🧸 3D мульт": "3D pixar style animation, cute characters, soft global illumination, vibrant",
  "🎨 Акварель": "delicate watercolor painting style, soft washes, paper texture",
  "🌃 Киберпанк": "cyberpunk, neon lights, rain, blade runner atmosphere, moody, highly detailed",
  "🐉 Фэнтези": "epic fantasy, magical atmosphere, volumetric light, concept art quality",
  "🕹️ Пиксель-арт": "detailed pixel art, 16-bit retro game aesthetic",
};
const SHOTS = [
  ["establishing wide shot of", "slow cinematic drone push-in"], ["medium shot of", "smooth tracking shot following the subject"],
  ["dramatic close-up of", "slow dolly-in, subtle natural movement"], ["low angle heroic shot of", "camera slowly tilts up"],
  ["aerial view of", "sweeping aerial fly-over"], ["over-the-shoulder shot of", "handheld camera, gentle motion"],
  ["silhouette at golden hour of", "slow orbit around the subject"], ["final epic wide shot of", "slow pull-back revealing the whole scene"],
];
const SIZES = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1024, 1024], "4:5": [864, 1080] };
const TD = 0.8; // transition overlap used for planning (matches server)

const state = {
  mode: "idea", engine: "pollinations", style: Object.keys(STYLES)[0], scenes: [], seed: rnd(),
  options: null, keys: { pollinations: "", runway: "" },
};
let uid = 0;

function rnd() { return Math.floor(Math.random() * 1e9); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchTimeout(url, ms, opts = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(t); }
}
async function pool(items, n, fn) {
  const q = items.slice(); const run = async () => { while (q.length) await fn(q.shift()); };
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, run));
}
const isAI = () => state.engine !== "motion";
const totalDur = () => Math.max(15, Math.min(600, +$("#durNum").value || 15));
const clipLen = () => isAI() ? (+$("#clipLen").value || 5) : 5;

/* ---------------- keys ---------------- */
try { Object.assign(state.keys, JSON.parse(localStorage.getItem("klavish_keys") || "{}")); } catch {}
const hasKey = e => !!(state.keys[e] || state.options?.configured?.[e]);
$("#btnKeys").onclick = openKeys;
function openKeys() {
  $("#keyPol").value = state.keys.pollinations || ""; $("#keyRun").value = state.keys.runway || "";
  $("#srvPol").textContent = state.options?.configured?.pollinations ? "✓ задан на сервере" : "";
  $("#srvRun").textContent = state.options?.configured?.runway ? "✓ задан на сервере" : "";
  $("#keysDlg").showModal();
}
$("#keysDlg").addEventListener("close", () => {
  if ($("#keysDlg").returnValue !== "save") return;
  state.keys = { pollinations: $("#keyPol").value.trim(), runway: $("#keyRun").value.trim() };
  if ($("#keyRemember").checked) localStorage.setItem("klavish_keys", JSON.stringify(state.keys));
  else localStorage.removeItem("klavish_keys");
  updateEngineUI();
});

/* ---------------- engine & settings UI ---------------- */
$$(".engine").forEach(b => b.onclick = () => {
  state.engine = b.dataset.engine;
  $$(".engine").forEach(x => x.classList.toggle("active", x === b));
  updateEngineUI();
});
function updateEngineUI() {
  const ai = isAI();
  $$(".ai-only").forEach(e => e.classList.toggle("hidden", !ai));
  $$(".motion-only").forEach(e => e.classList.toggle("hidden", ai));
  const note = $("#engineNote"); note.className = "note";
  if (ai && state.options) {
    const models = state.options.models[state.engine];
    const sel = $("#model"); const prev = localStorage.getItem("klavish_model_" + state.engine);
    sel.innerHTML = Object.entries(models).map(([id, m]) => `<option value="${id}">${m.label}</option>`).join("");
    if (prev && models[prev]) sel.value = prev;
    fillClipLens();
  }
  if (ai && !hasKey(state.engine)) {
    note.classList.add("warn");
    note.innerHTML = state.engine === "pollinations"
      ? `🔑 Нужен ключ Pollinations — <a href="https://enter.pollinations.ai" target="_blank" rel="noopener">бесплатная регистрация</a>, еженедельные бесплатные кредиты. <button id="nk">Вставить ключ</button>`
      : `🔑 Нужен API-ключ Runway (<a href="https://dev.runwayml.com" target="_blank" rel="noopener">dev.runwayml.com</a>, платно, Gen-4.5 ≈ 12 кредитов/сек). <button id="nk">Вставить ключ</button>`;
    $("#nk").onclick = openKeys;
  } else if (ai) {
    note.textContent = "✅ Ключ задан — каждая сцена будет снята ИИ-видеомоделью с настоящим движением.";
  } else {
    note.textContent = "Бесплатный режим: ИИ рисует кадры, монтажёр оживляет их движением камеры и переходами.";
  }
  updatePlan();
}
function fillClipLens() {
  const m = state.options.models[state.engine][$("#model").value];
  const opts = m.durations.filter(d => d <= 15);
  const cur = +$("#clipLen").value || 5;
  $("#clipLen").innerHTML = opts.map(d => `<option value="${d}">${d} с</option>`).join("");
  $("#clipLen").value = opts.reduce((a, b) => Math.abs(b - cur) < Math.abs(a - cur) ? b : a, opts[0]);
}
$("#model").onchange = () => { localStorage.setItem("klavish_model_" + state.engine, $("#model").value); fillClipLens(); updatePlan(); };
$("#clipLen").onchange = updatePlan;
$("#transition").onchange = updatePlan;

function planScenes() {
  const L = totalDur(), c = clipLen(), td = $("#transition").value === "none" ? 0 : TD;
  const n = Math.min(60, Math.max(1, Math.ceil((L - td) / Math.max(1, c - td))));
  return { n, d: (L + (n - 1) * td) / n };
}
function updatePlan() {
  const L = totalDur(); const { n, d } = planScenes();
  const mm = L >= 60 ? `${Math.floor(L / 60)} мин ${L % 60 ? (L % 60) + " с" : ""}` : `${L} с`;
  let html = `⏱ <b>${mm}</b> → <b>${n}</b> ${plural(n, "сцена", "сцены", "сцен")} по ~${d.toFixed(1)} с` +
    (isAI() ? ` · ${n} ИИ-${plural(n, "клип", "клипа", "клипов")} по ${clipLen()} с` : "");
  const have = state.scenes.length;
  if (have && have !== n) html += `<br><span class="hint">В раскадровке сейчас ${have} — каждая сцена растянется до ~${((L + (have - 1) * TD) / have).toFixed(1)} с. Добавьте/удалите сцены или создайте раскадровку заново.</span>`;
  $("#planInfo").innerHTML = html;
}
function plural(n, a, b, c) { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; }

$("#durRange").oninput = e => { $("#durNum").value = e.target.value; updatePlan(); };
$("#durNum").oninput = e => { $("#durRange").value = Math.min(180, +e.target.value || 15); updatePlan(); };
$("#durNum").onchange = e => { e.target.value = totalDur(); updatePlan(); };

const stylesEl = $("#styles");
Object.keys(STYLES).forEach(name => {
  const b = document.createElement("button");
  b.className = "chip" + (name === state.style ? " active" : ""); b.textContent = name;
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
$("#aspect").onchange = () => $$(".thumb").forEach(applyAspect);
function applyAspect(el) { el.style.aspectRatio = $("#aspect").value.replace(":", "/"); }

/* ---------------- storyboard ---------------- */
function extractJSON(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("no json");
  return JSON.parse(text.slice(s, e + 1));
}
async function aiStoryboard(idea, n, sceneSec) {
  const instr =
    `You are a genius film director. Create a storyboard for a ${Math.round(sceneSec * n)}-second video about: "${idea}". ` +
    `Return ONLY JSON: {"title": string, "scenes": [{"caption": string, "prompt": string, "motion": string}]} with exactly ${n} scenes (~${sceneSec.toFixed(0)}s each). ` +
    `"caption": short evocative subtitle in the SAME language as the idea (max 12 words). ` +
    `"prompt": vivid detailed ENGLISH description of the shot (subject, setting, composition, lighting). ` +
    `"motion": ENGLISH description of what moves during the shot and the camera move (e.g. "the robot walks forward, neon signs flicker, slow dolly-in"). ` +
    `Keep the main character and world visually consistent (repeat their key visual traits in every prompt). Tell a story with a beginning, climax and ending.`;
  const r = await fetchTimeout(`https://text.pollinations.ai/${encodeURIComponent(instr)}?json=true&seed=${state.seed}`, 45000);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const data = extractJSON(await r.text());
  const scenes = (data.scenes || []).filter(s => s && s.prompt).slice(0, n);
  if (!scenes.length) throw new Error("empty");
  return { title: String(data.title || ""), scenes };
}
function localStoryboard(idea, n) {
  const parts = idea.split(/(?<=[.!?…])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  return {
    title: "", scenes: Array.from({ length: n }, (_, i) => {
      const base = parts.length > 1 ? parts[i % parts.length] : idea;
      const [shot, motion] = SHOTS[Math.round(i * (SHOTS.length - 1) / Math.max(1, n - 1))];
      return { caption: parts.length > 1 ? base : (i === 0 ? idea : ""), prompt: `${shot} ${base}`, motion };
    }),
  };
}
$("#btnStory").onclick = async () => {
  const idea = $("#prompt").value.trim();
  if (!idea) { $("#prompt").focus(); return flash("#storyStatus", "Сначала опишите идею 🙂"); }
  const { n, d } = planScenes();
  const btn = $("#btnStory"); btn.disabled = true; state.seed = rnd();
  flash("#storyStatus", `🧠 ИИ-режиссёр пишет сценарий на ${n} ${plural(n, "сцену", "сцены", "сцен")}…`);
  let story;
  try { story = await aiStoryboard(idea, n, d); flash("#storyStatus", "✅ Сценарий готов, рисую ключевые кадры…"); }
  catch (e) {
    console.warn("LLM unavailable:", e); story = localStoryboard(idea, n);
    flash("#storyStatus", "⚠️ ИИ-сценарист недоступен — шаблонная раскадровка. Рисую кадры…");
  }
  if (story.title && !$("#title").value.trim()) $("#title").value = story.title;
  state.scenes.forEach(freeScene);
  state.scenes = story.scenes.map(s => newScene({ caption: s.caption || "", prompt: s.prompt, motion: s.motion || "" }));
  showBoard(); await generateAllFrames();
  btn.disabled = false;
  flash("#storyStatus", `🎞️ Раскадровка готова. Жмите «Создать видео»${isAI() ? " — ИИ снимет каждую сцену" : ""}.`);
};
function newScene(o) {
  return { id: ++uid, caption: "", prompt: "", motion: "", blob: null, url: "", imageUrl: "", publicUrl: "", source: "",
    seed: rnd(), clipId: "", clipUrl: "", clipMsg: "", clipErr: false, userClip: null, userClipUrl: "", ...o };
}
function freeScene(sc) { [sc.url, sc.userClipUrl].forEach(u => u && URL.revokeObjectURL(u)); }

/* ---------------- keyframes ---------------- */
async function genImage(sc) {
  sc.loading = true; renderScenes();
  const [w, h] = SIZES[$("#aspect").value] || SIZES["16:9"];
  const full = `${sc.prompt}, ${STYLES[state.style]}`;
  let blob = null, source = "", imageUrl = "";
  for (let attempt = 0; attempt < 3 && !blob; attempt++) {
    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=${w}&height=${h}&seed=${sc.seed}&nologo=true&model=flux`;
      const r = await fetchTimeout(url, 90000);
      if (r.ok && (r.headers.get("content-type") || "").startsWith("image")) { blob = await r.blob(); source = "ИИ"; imageUrl = url; }
      else if (r.status === 429) await sleep(8000 * (attempt + 1));
      else break;
    } catch (e) { console.warn("image gen failed", e); break; }
  }
  if (!blob) {
    const r = await fetch(`/api/procedural?prompt=${encodeURIComponent(sc.prompt + " " + sc.caption)}&w=${w}&h=${h}&seed=${sc.seed}`);
    blob = await r.blob(); source = "офлайн";
  }
  setBlob(sc, blob, source); sc.imageUrl = imageUrl;
  sc.loading = false; renderScenes();
}
function setBlob(sc, blob, source) {
  if (sc.url) URL.revokeObjectURL(sc.url);
  sc.blob = blob; sc.url = URL.createObjectURL(blob); sc.source = source; sc.imageUrl = ""; sc.publicUrl = "";
  sc.clipId = ""; sc.clipUrl = ""; sc.clipMsg = ""; sc.clipErr = false; // new frame → old clip is stale
}
async function generateAllFrames() { await pool(state.scenes.slice(), 2, sc => state.scenes.includes(sc) ? genImage(sc) : null); }

/* ---------------- AI clips ---------------- */
async function publicFrameUrl(sc) {
  if (sc.imageUrl) return sc.imageUrl;
  if (sc.publicUrl) return sc.publicUrl;
  const fd = new FormData(); fd.append("image", sc.blob, "frame.jpg");
  const j = await (await fetch("/api/upload", { method: "POST", body: fd })).json();
  sc.publicUrl = location.origin + j.path;
  return sc.publicUrl;
}
async function genClip(sc) {
  if (!hasKey(state.engine)) { openKeys(); throw new Error("нет ключа"); }
  sc.clipping = true; sc.clipErr = false; sc.clipMsg = "Отправляю в модель…"; renderScenes();
  try {
    const fd = new FormData();
    fd.append("provider", state.engine); fd.append("model", $("#model").value);
    const vp = [sc.prompt, sc.motion, STYLES[state.style]].filter(Boolean).join(". ");
    fd.append("prompt", vp); fd.append("duration", clipLen()); fd.append("aspect", $("#aspect").value);
    fd.append("seed", sc.seed);
    if ($("#useFrame").checked && sc.blob) {
      if (state.engine === "runway") fd.append("image", sc.blob, "frame.jpg");
      else fd.append("image_url", await publicFrameUrl(sc));
    }
    const headers = state.keys[state.engine] ? { "X-Provider-Key": state.keys[state.engine] } : {};
    const r = await fetch("/api/clip", { method: "POST", body: fd, headers });
    const j = await r.json(); if (!r.ok) throw new Error(j.detail || "Ошибка сервера");
    while (true) {
      await sleep(2500);
      const s = await (await fetch(`/api/jobs/${j.job_id}`)).json();
      sc.clipMsg = s.message; updateSceneEl(sc);
      if (s.status === "done") { sc.clipId = s.clip_id; sc.clipUrl = s.clip; sc.clipMsg = ""; break; }
      if (s.status === "error") throw new Error(s.message);
    }
  } catch (e) {
    sc.clipErr = true; sc.clipMsg = "⚠️ " + e.message; throw e;
  } finally { sc.clipping = false; renderScenes(); }
}

/* ---------------- scene board ---------------- */
function showBoard() { $("#board").classList.remove("hidden"); $("#result").classList.add("hidden"); renderScenes(); $("#board").scrollIntoView({ behavior: "smooth" }); }
function badgeFor(sc) {
  if (sc.clipUrl) return "🎥 ИИ-видео"; if (sc.userClip) return "🎞 ваше видео";
  return { "ИИ": "✨ ИИ-кадр", "фото": "🖼 фото", "офлайн": "🎨 офлайн" }[sc.source] || "";
}
function updateSceneEl(sc) {
  const el = $(`.scene[data-id="${sc.id}"]`); if (!el) return;
  const cs = $(".cstat", el); cs.textContent = sc.clipMsg || ""; cs.classList.toggle("err", !!sc.clipErr);
}
function renderScenes() {
  const box = $("#scenes"); box.innerHTML = "";
  state.scenes.forEach((sc, i) => {
    const el = $("#sceneTpl").content.firstElementChild.cloneNode(true);
    el.dataset.id = sc.id;
    el.classList.toggle("loading", !!sc.loading); el.classList.toggle("clipping", !!sc.clipping);
    applyAspect($(".thumb", el));
    const img = $("img", el), vid = $("video", el);
    if (sc.url) { img.src = sc.url; img.onload = () => img.classList.add("ok"); }
    const vsrc = sc.clipUrl || sc.userClipUrl;
    if (vsrc) { vid.src = vsrc; vid.classList.remove("hidden"); el.onmouseenter = () => vid.play().catch(() => {}); el.onmouseleave = () => vid.pause(); }
    $(".badge", el).textContent = badgeFor(sc);
    $(".num", el).textContent = i + 1;
    const cs = $(".cstat", el); cs.textContent = sc.clipMsg || ""; cs.classList.toggle("err", !!sc.clipErr);
    const cap = $(".caption", el); cap.value = sc.caption; cap.oninput = () => sc.caption = cap.value;
    const pr = $(".sprompt", el); pr.value = sc.prompt; pr.oninput = () => sc.prompt = pr.value;
    const mo = $(".smotion", el); mo.value = sc.motion; mo.oninput = () => sc.motion = mo.value;
    $(".animate", el).classList.toggle("hidden", !isAI());
    $(".animate", el).onclick = () => genClip(sc).catch(() => {});
    $(".regen", el).onclick = () => { if (!sc.prompt.trim()) sc.prompt = sc.caption || $("#prompt").value; sc.seed = rnd(); genImage(sc); };
    $(".del", el).onclick = () => { freeScene(sc); state.scenes.splice(state.scenes.indexOf(sc), 1); renderScenes(); };
    $(".left", el).onclick = () => move(i, -1);
    $(".right", el).onclick = () => move(i, 1);
    $(".up", el).onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.type.startsWith("video/")) { if (sc.userClipUrl) URL.revokeObjectURL(sc.userClipUrl); sc.userClip = f; sc.userClipUrl = URL.createObjectURL(f); sc.clipId = ""; sc.clipUrl = ""; }
      else { setBlob(sc, f, "фото"); sc.userClip = null; }
      renderScenes();
    };
    box.appendChild(el);
  });
  updatePlan();
}
function move(i, d) { const j = i + d; if (j < 0 || j >= state.scenes.length) return; [state.scenes[i], state.scenes[j]] = [state.scenes[j], state.scenes[i]]; renderScenes(); }
$("#btnAdd").onclick = () => { const sc = newScene({ prompt: $("#prompt").value.trim() || "beautiful cinematic scenery", motion: "slow cinematic camera move" }); state.scenes.push(sc); renderScenes(); genImage(sc); };
$("#btnRegenAll").onclick = async () => { state.scenes.forEach(s => s.seed = rnd()); await generateAllFrames(); };

function addPhotos(files) {
  const list = [...files].filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
  list.forEach(f => {
    const sc = newScene({ prompt: "", motion: "natural cinematic motion, subtle camera movement" });
    if (f.type.startsWith("video/")) { sc.userClip = f; sc.userClipUrl = URL.createObjectURL(f); sc.source = "фото"; }
    else setBlob(sc, f, "фото");
    state.scenes.push(sc);
  });
  if (list.length) showBoard();
}
$("#photoInput").onchange = e => addPhotos(e.target.files);
const drop = $("#drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => addPhotos(e.dataTransfer.files));

/* ---------------- make the film ---------------- */
async function makeVideo(regenerateClips = true) {
  const scenes = state.scenes.filter(s => s.blob || s.userClip || s.clipId);
  if (!scenes.length) return flash("#renderMsg", "Нет готовых сцен");
  if (state.scenes.some(s => s.loading || s.clipping)) return flash("#renderMsg", "Подождите, сцены ещё генерируются…");
  const btn = $("#btnRender"); btn.disabled = true; $("#btnAgain").disabled = true;
  $("#renderBox").classList.remove("hidden"); $("#result").classList.add("hidden");
  try {
    // 1) shoot AI clips for scenes that don't have one yet
    if (isAI() && regenerateClips) {
      if (!hasKey(state.engine)) { openKeys(); throw new Error("Добавьте ключ API или выберите «Анимация кадров»"); }
      const todo = scenes.filter(s => !s.clipId && !s.userClip);
      let done = 0, failed = 0;
      setProgress(0, `🎥 ИИ снимает сцены: 0 из ${todo.length}`);
      await pool(todo, 3, async sc => {
        try { await genClip(sc); } catch { failed++; }
        done++; setProgress(0.5 * done / todo.length, `🎥 ИИ снимает сцены: ${done} из ${todo.length}${failed ? ` · ошибок: ${failed}` : ""}`);
      });
      if (failed === todo.length && todo.length) {
        const err = todo[0].clipMsg.replace(/^⚠️\s*/, "");
        if (!confirm(`Не удалось сгенерировать ни одного ИИ-клипа:\n${err}\n\nСобрать видео из анимированных кадров?`)) throw new Error(err);
      }
    }
    // 2) montage
    const cfg = {
      aspect: $("#aspect").value, total_duration: totalDur(), motion: $("#motion").value, transition: $("#transition").value,
      grade: $("#grade").value, music: $("#music").value, fps: +$("#fps").value, captions: $("#captions").checked,
      title: $("#title").value.trim(), seed: rnd(), scenes: [],
    };
    const fd = new FormData(); let mi = 0;
    for (const s of scenes) {
      if (s.clipId) cfg.scenes.push({ caption: s.caption, clip_id: s.clipId });
      else if (s.userClip) { fd.append("media", s.userClip, "clip.mp4"); cfg.scenes.push({ caption: s.caption, media: mi++ }); }
      else { fd.append("media", s.blob, "frame.jpg"); cfg.scenes.push({ caption: s.caption, media: mi++ }); }
    }
    if (cfg.music === "file") { const f = $("#audioFile").files[0]; if (f) fd.append("audio", f); else cfg.music = "none"; }
    fd.append("config", JSON.stringify(cfg));
    const base = isAI() && regenerateClips ? 0.5 : 0;
    setProgress(base, "🎬 Монтаж: загружаю сцены…");
    const r = await fetch("/api/render", { method: "POST", body: fd });
    const j = await r.json(); if (!r.ok) throw new Error(j.detail || "Ошибка сервера");
    while (true) {
      await sleep(800);
      const s = await (await fetch(`/api/jobs/${j.job_id}`)).json();
      setProgress(base + (1 - base) * s.progress, "🎬 " + s.message);
      if (s.status === "done") { showResult(s.video); break; }
      if (s.status === "error") throw new Error(s.message);
    }
  } catch (e) { setProgress(0, "❌ " + e.message); }
  btn.disabled = false; $("#btnAgain").disabled = false;
}
function setProgress(p, msg) { $("#barFill").style.width = Math.round(p * 100) + "%"; $("#renderMsg").textContent = msg || ""; }
function showResult(url) {
  $("#renderBox").classList.add("hidden");
  const v = $("#player"); v.src = url; $("#download").href = url;
  $("#download").download = "klavish-" + url.split("/").pop();
  $("#result").classList.remove("hidden"); v.play().catch(() => {});
  $("#result").scrollIntoView({ behavior: "smooth", block: "center" });
  loadGallery();
}
$("#btnRender").onclick = () => makeVideo(true);
$("#btnAgain").onclick = () => makeVideo(false);

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
        <div class="meta"><span></span><div><a class="icon" href="${it.video}" download="klavish-${it.id}.mp4" title="Скачать">⬇</a><button class="icon" title="Удалить">🗑</button></div></div>`;
      const dur = it.duration ? ` · ${Math.round(it.duration)} с` : "";
      $("span", d).innerHTML = "";
      $("span", d).append(document.createTextNode(it.title || new Date(it.created * 1000).toLocaleString()));
      const tag = document.createElement("div"); tag.className = "tag";
      tag.textContent = (it.ai_clips ? `🎥 ${it.ai_clips} ИИ-клипов` : "🖼 анимация кадров") + dur;
      $("span", d).append(tag);
      $("button", d).onclick = async () => { if (confirm("Удалить видео?")) { await fetch(`/api/videos/${it.id}`, { method: "DELETE" }); loadGallery(); } };
      g.appendChild(d);
    });
  } catch (e) { console.warn(e); }
}

function flash(sel, msg) { $(sel).textContent = msg; }

(async () => {
  try { state.options = await (await fetch("/api/options")).json(); } catch {}
  updateEngineUI(); loadGallery();
})();
