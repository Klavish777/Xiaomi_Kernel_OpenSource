"""Headless Klavish run: idea -> AI storyboard -> AI keyframes -> (AI clips) -> MP4.

Uses Pollinations' free keyless endpoints for text + images. If POLLINATIONS_KEY
is set (or anonymous access is allowed) it also tries a real AI video model.

    python scripts/demo.py "Кот-астронавт открывает новую планету" --seconds 20 --out demo
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PIL import Image  # noqa: E402

from app import procedural, providers  # noqa: E402
from app.music import synth_music  # noqa: E402
from app.render import RenderSettings, Scene, plan_timeline, render_video  # noqa: E402

UA = {"User-Agent": "Klavish/1.0 (+https://github.com/Klavish777)"}
STYLE = "cinematic film still, dramatic lighting, anamorphic lens, shallow depth of field, highly detailed"


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


def http_get(url: str, timeout: int = 120) -> tuple[int, bytes, str]:
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:500], ""
    except Exception as e:  # noqa: BLE001
        return 0, str(e).encode(), ""


def storyboard(idea: str, n: int, sec: float) -> tuple[dict, str]:
    instr = (
        f'You are a genius film director. Create a storyboard for a {round(sec * n)}-second video about: "{idea}". '
        f'Return ONLY JSON: {{"title": string, "scenes": [{{"caption": string, "prompt": string, "motion": string}}]}} '
        f"with exactly {n} scenes. caption: short subtitle in the SAME language as the idea (max 12 words). "
        f"prompt: vivid detailed ENGLISH description of the shot. motion: ENGLISH description of movement and camera. "
        f"Keep the main character visually consistent. Beginning, climax, ending."
    )
    for attempt in range(3):
        st, body, _ = http_get(f"https://text.pollinations.ai/{urllib.parse.quote(instr)}?json=true&seed={attempt + 1}", 90)
        if st == 200:
            try:
                t = body.decode()
                data = json.loads(t[t.index("{"): t.rindex("}") + 1])
                scenes = [s for s in data.get("scenes", []) if s.get("prompt")][:n]
                if scenes:
                    return {"title": data.get("title", ""), "scenes": scenes}, "ИИ (Pollinations text)"
            except Exception as e:  # noqa: BLE001
                log("storyboard parse error:", e)
        log(f"storyboard attempt {attempt + 1}: HTTP {st}")
        time.sleep(5)
    return {"title": idea, "scenes": [{"caption": idea if i == 0 else "", "prompt": idea, "motion": "slow camera move"}
                                      for i in range(n)]}, "шаблон (LLM недоступен)"


def keyframe(prompt: str, w: int, h: int, seed: int) -> tuple[Image.Image, str, str]:
    url = (f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt + ', ' + STYLE)}"
           f"?width={w}&height={h}&seed={seed}&nologo=true&model=flux&referrer=klavish")
    for attempt in range(4):
        st, body, ct = http_get(url, 150)
        if st == 200 and ct.startswith("image"):
            return Image.open(io.BytesIO(body)).convert("RGB"), "ИИ (Flux)", url
        log(f"  image attempt {attempt + 1}: HTTP {st} {body[:120]!r}")
        time.sleep(16 * (attempt + 1))
    return procedural.paint(prompt, w, h, seed), "офлайн", ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("idea")
    ap.add_argument("--seconds", type=float, default=20)
    ap.add_argument("--aspect", default="16:9")
    ap.add_argument("--clip", type=float, default=5)
    ap.add_argument("--video-model", default="alibaba/wan-2.2-fast")
    ap.add_argument("--out", default="demo")
    ap.add_argument("--offline", action="store_true", help="skip network (local test)")
    a = ap.parse_args()

    out = ROOT / a.out
    out.mkdir(parents=True, exist_ok=True)
    total = max(15.0, a.seconds)
    n = max(1, -int(-(total - 0.8) // (a.clip - 0.8)))
    d, _ = plan_timeline(n, RenderSettings(total_duration=total))
    report = [f"# Klavish — демо-прогон\n", f"- Идея: **{a.idea}**", f"- Длина: {total:.0f} с → {n} сцен по ~{d:.1f} с"]
    log(f"plan: {n} scenes x {d:.2f}s")

    if a.offline:
        global http_get
        http_get = lambda url, timeout=0: (0, b"offline", "")  # noqa: E731
        time.sleep = lambda s: None
    sb, sb_src = storyboard(a.idea, n, d)
    report.append(f"- Сценарий: {sb_src}")
    log("storyboard:", sb_src, json.dumps(sb, ensure_ascii=False)[:400])

    w, h = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (1024, 1024)}.get(a.aspect, (1280, 720))
    scenes, frames_src = [], []
    for i, s in enumerate(sb["scenes"]):
        log(f"keyframe {i + 1}/{len(sb['scenes'])}")
        img, src, url = keyframe(s["prompt"], w, h, 1000 + i)
        img.save(out / f"frame_{i + 1:02d}.jpg", quality=88)
        frames_src.append(src)
        scene = Scene(image=img, caption=s.get("caption", ""))
        # try a real AI video clip for this scene
        key = os.getenv("POLLINATIONS_KEY")
        clip = out / f"clip_{i + 1:02d}.mp4"
        if key and url:
            try:
                providers.pollinations_video(f"{s['prompt']}. {s.get('motion', '')}", clip, model=a.video_model,
                                             duration=a.clip, aspect=a.aspect, image_url=url, key=key, seed=i,
                                             progress=log)
                scene.clip = clip
            except Exception as e:  # noqa: BLE001
                log("  clip:", str(e)[:200])
                if i == 0:
                    report.append(f"- ИИ-видео ({a.video_model}): ошибка — {str(e)[:160]}")
        elif i == 0 and not a.offline:
            # probe: is keyless video generation allowed right now?
            q = urllib.parse.urlencode({"model": a.video_model, "duration": int(a.clip), "aspectRatio": a.aspect})
            st, body, ct = http_get(f"https://gen.pollinations.ai/video/{urllib.parse.quote(s['prompt'][:500])}?{q}", 600)
            if st == 200 and ct.startswith("video"):
                clip.write_bytes(body)
                scene.clip = clip
                report.append(f"- ИИ-видео ({a.video_model}) без ключа: ✅ работает")
            else:
                report.append(f"- ИИ-видео ({a.video_model}) без ключа: ❌ HTTP {st} — "
                              f"{body[:160].decode(errors='ignore')} (нужен POLLINATIONS_KEY)")
            log("  keyless video probe:", st, body[:200])
        scenes.append(scene)
        time.sleep(3)

    n_ai = frames_src.count("ИИ (Flux)")
    n_clips = sum(1 for s in scenes if s.clip)
    report.append(f"- Кадры: {n_ai} из {len(scenes)} нарисованы ИИ (Flux)")
    report.append(f"- ИИ-клипов с движением: {n_clips} из {len(scenes)}")
    report.append("\n## Сцены\n")
    for i, s in enumerate(sb["scenes"]):
        report.append(f"{i + 1}. **{s.get('caption', '')}**  \n   _{s['prompt'][:220]}_  \n   ![](frame_{i + 1:02d}.jpg)")

    settings = RenderSettings(aspect=a.aspect, total_duration=total, title=sb.get("title") or a.idea,
                              grade="cinematic", transition="crossfade", seed=7)
    music = synth_music(total, "epic", out / "music.wav", seed=7)
    t0 = time.time()
    video = render_video(scenes, out / "klavish-demo.mp4", settings,
                         lambda p, m: None if int(p * 100) % 20 else log(f"render {p:.0%}"), music)
    (out / "music.wav").unlink(missing_ok=True)
    for c in out.glob("clip_*.mp4"):
        c.unlink()
    report.insert(3, f"- Рендер: {time.time() - t0:.1f} с → [klavish-demo.mp4](klavish-demo.mp4)")
    (out / "README.md").write_text("\n".join(report) + "\n")
    log("done:", video)


if __name__ == "__main__":
    main()
