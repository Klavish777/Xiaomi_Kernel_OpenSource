"""Genius Video AI - FastAPI backend.

Run:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import io
import json
import os
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

from . import procedural, providers
from .music import MOODS, synth_music
from .render import (GRADES, MOTIONS, RESOLUTIONS, TRANSITIONS, RenderSettings, Scene,
                     clip_first_frame, plan_timeline, render_video)

ROOT = Path(__file__).resolve().parent.parent
providers.load_dotenv(ROOT / ".env")

DATA = ROOT / "data"
VIDEOS, WORK, CLIPS, UPLOADS = DATA / "videos", DATA / "work", DATA / "clips", DATA / "uploads"
for p in (VIDEOS, WORK, CLIPS, UPLOADS):
    p.mkdir(parents=True, exist_ok=True)

MIN_DURATION = 15.0
MAX_DURATION = 600.0
MAX_SCENES = 60
MAX_UPLOAD = 150 * 1024 * 1024

app = FastAPI(title="Genius Video AI")
render_pool = ThreadPoolExecutor(max_workers=1)  # CPU-bound: one at a time
clip_pool = ThreadPoolExecutor(max_workers=int(os.getenv("CLIP_WORKERS", "3")))  # network-bound
jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


def _new_job(kind: str, **kw) -> str:
    jid = uuid.uuid4().hex[:12]
    with jobs_lock:
        jobs[jid] = {"id": jid, "kind": kind, "status": "queued", "progress": 0.0, "message": "В очереди", **kw}
    return jid


def _update(job_id: str, **kw) -> None:
    with jobs_lock:
        jobs[job_id].update(kw)


def _safe_id(s: str) -> str:
    if not s or not s.isalnum() or len(s) > 40:
        raise HTTPException(400, "bad id")
    return s


# ---------------------------------------------------------------------------
# info
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    import imageio_ffmpeg
    return {"ok": True, "ffmpeg": imageio_ffmpeg.get_ffmpeg_version()}


@app.get("/api/options")
def options():
    return {
        "aspects": list(RESOLUTIONS), "motions": MOTIONS, "transitions": TRANSITIONS,
        "grades": GRADES, "moods": list(MOODS), "min_duration": MIN_DURATION, "max_duration": MAX_DURATION,
        "configured": providers.configured(),
        "models": {
            "pollinations": {k: {"label": v[0], "durations": v[1]} for k, v in providers.POLLINATIONS_MODELS.items()},
            "runway": {k: {"label": v[0], "durations": v[1]} for k, v in providers.RUNWAY_MODELS.items()},
        },
    }


@app.get("/api/procedural")
def procedural_image(prompt: str = Query("", max_length=2000), w: int = 1280, h: int = 720, seed: int = 0):
    w, h = max(256, min(w, 1920)), max(256, min(h, 1920))
    img = procedural.paint(prompt, w, h, seed)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=92)
    return Response(buf.getvalue(), media_type="image/jpeg")


@app.post("/api/upload")
async def upload_image(image: UploadFile = File(...)):
    """Store a keyframe so video models can fetch it by public URL."""
    data = await image.read()
    try:
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    except Exception:
        raise HTTPException(400, "Не изображение")
    im.thumbnail((1920, 1920))
    name = uuid.uuid4().hex[:16] + ".jpg"
    im.save(UPLOADS / name, "JPEG", quality=92)
    return {"path": f"/uploads/{name}"}


# ---------------------------------------------------------------------------
# AI clip generation
# ---------------------------------------------------------------------------

def _run_clip(job_id: str, provider: str, model: str, prompt: str, duration: float, aspect: str,
              image: Optional[bytes], image_url: Optional[str], key: Optional[str], seed: int):
    out = CLIPS / f"{job_id}.mp4"
    try:
        _update(job_id, status="running", message="Отправляю в модель…", progress=0.05)
        cb = lambda m: _update(job_id, message=m)
        if provider == "runway":
            providers.runway_video(prompt, out, model=model, duration=duration, aspect=aspect,
                                   image=image, key=key, seed=seed, progress=cb)
        elif provider == "pollinations":
            providers.pollinations_video(prompt, out, model=model, duration=duration, aspect=aspect,
                                         image_url=image_url, key=key, seed=seed, progress=cb)
        else:
            raise providers.ProviderError(f"Неизвестный провайдер {provider}")
        if clip_first_frame(out) is None:
            out.unlink(missing_ok=True)
            raise providers.ProviderError("Модель вернула неверный видеофайл")
        _update(job_id, status="done", progress=1.0, message="Клип готов", clip_id=job_id, clip=f"/clips/{job_id}.mp4")
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        _update(job_id, status="error", message=str(e))


@app.post("/api/clip")
async def create_clip(provider: str = Form(...), model: str = Form(...), prompt: str = Form(...),
                      duration: float = Form(5), aspect: str = Form("16:9"), seed: int = Form(0),
                      image_url: Optional[str] = Form(None), image: Optional[UploadFile] = File(None),
                      x_provider_key: Optional[str] = Header(None)):
    img_bytes = await image.read() if image is not None and image.filename else None
    if img_bytes and len(img_bytes) > MAX_UPLOAD:
        raise HTTPException(413, "Слишком большой кадр")
    if provider == "pollinations" and image_url and image_url.startswith("/"):
        raise HTTPException(400, "image_url должен быть абсолютным публичным URL")
    jid = _new_job("clip")
    clip_pool.submit(_run_clip, jid, provider, model, prompt.strip(), duration, aspect,
                     img_bytes, image_url, (x_provider_key or "").strip() or None, seed)
    return {"job_id": jid}


# ---------------------------------------------------------------------------
# final render
# ---------------------------------------------------------------------------

def _run_render(job_id: str, scenes_in: list, config: dict, audio: Optional[Path], tmp_files: List[Path]):
    try:
        _update(job_id, status="running", message="Старт рендера", progress=0.01)
        scenes = []
        for item in scenes_in:
            if item["type"] == "clip":
                scenes.append(Scene(clip=item["path"], caption=item["caption"]))
            else:
                img = ImageOps.exif_transpose(Image.open(item["path"])).convert("RGB")
                scenes.append(Scene(image=img, caption=item["caption"], motion=item.get("motion", "auto")))

        total = float(config.get("total_duration") or 0)
        total = max(MIN_DURATION, min(MAX_DURATION, total)) if total else MIN_DURATION
        s = RenderSettings(
            aspect=config.get("aspect", "16:9"), fps=int(config.get("fps", 24)),
            transition=config.get("transition", "crossfade"),
            transition_duration=float(config.get("transition_duration", 0.8)),
            motion=config.get("motion", "auto"), grade=config.get("grade", "cinematic"),
            captions=bool(config.get("captions", True)), title=str(config.get("title", ""))[:120],
            seed=int(config.get("seed", 0)) % (2 ** 31), audio_path=audio, total_duration=total,
        )

        music = None
        mood = config.get("music", "none")
        if audio is None and mood in MOODS:
            _update(job_id, message="Сочиняю саундтрек", progress=0.02)
            music = synth_music(total, mood, WORK / f"{job_id}.wav", seed=s.seed)

        out = VIDEOS / f"{job_id}.mp4"
        render_video(scenes, out, s, lambda p, m: _update(job_id, progress=round(p, 3), message=m), music)

        poster = scenes[0].image if scenes[0].image is not None else clip_first_frame(scenes[0].clip)
        if poster is not None:
            poster = poster.copy()
            poster.thumbnail((480, 480))
            poster.save(VIDEOS / f"{job_id}.jpg", quality=85)
        n_clips = sum(1 for x in scenes if x.clip is not None)
        meta = {"id": job_id, "title": s.title or (scenes[0].caption or ""), "created": time.time(),
                "aspect": s.aspect, "scenes": len(scenes), "ai_clips": n_clips, "duration": total}
        (VIDEOS / f"{job_id}.json").write_text(json.dumps(meta, ensure_ascii=False))
        _update(job_id, status="done", progress=1.0, message="Готово!", video=f"/videos/{job_id}.mp4")
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        _update(job_id, status="error", message=str(e))
    finally:
        for f in tmp_files:
            f.unlink(missing_ok=True)
        if audio:
            audio.unlink(missing_ok=True)
        (WORK / f"{job_id}.wav").unlink(missing_ok=True)


@app.post("/api/render")
async def render(config: str = Form(...), media: List[UploadFile] = File(default=[]),
                 audio: Optional[UploadFile] = File(None)):
    """config.scenes[i] = {caption, media: <index into uploaded media>} or {caption, clip_id}."""
    try:
        cfg = json.loads(config)
    except json.JSONDecodeError:
        raise HTTPException(400, "config должен быть JSON")
    scene_cfg = cfg.get("scenes") or []
    if not scene_cfg:
        raise HTTPException(400, "Нужна хотя бы одна сцена")
    if len(scene_cfg) > MAX_SCENES:
        raise HTTPException(400, f"Максимум {MAX_SCENES} сцен")

    job_id = _new_job("render")
    tmp: List[Path] = []
    stored = []
    for i, up in enumerate(media):
        data = await up.read()
        if len(data) > MAX_UPLOAD:
            raise HTTPException(413, "Файл слишком большой")
        is_video = (up.content_type or "").startswith("video/")
        p = WORK / f"{job_id}_{i:02d}.{'mp4' if is_video else 'img'}"
        p.write_bytes(data)
        tmp.append(p)
        if not is_video:
            try:
                Image.open(p).verify()
            except Exception:
                is_video = clip_first_frame(p) is not None
                if not is_video:
                    raise HTTPException(400, f"Файл {i + 1}: не изображение и не видео")
        stored.append((p, is_video))

    scenes = []
    for k, sc in enumerate(scene_cfg):
        cap = str(sc.get("caption", ""))[:300]
        if sc.get("clip_id"):
            p = CLIPS / f"{_safe_id(str(sc['clip_id']))}.mp4"
            if not p.exists():
                raise HTTPException(400, f"Сцена {k + 1}: клип не найден")
            scenes.append({"type": "clip", "path": p, "caption": cap})
        elif isinstance(sc.get("media"), int) and 0 <= sc["media"] < len(stored):
            p, is_video = stored[sc["media"]]
            scenes.append({"type": "clip" if is_video else "image", "path": p, "caption": cap,
                           "motion": sc.get("motion", "auto")})
        else:
            raise HTTPException(400, f"Сцена {k + 1}: нет кадра")

    audio_path = None
    if audio is not None and audio.filename:
        data = await audio.read()
        if len(data) > MAX_UPLOAD:
            raise HTTPException(413, "Аудиофайл слишком большой")
        audio_path = WORK / f"{job_id}_audio{Path(audio.filename).suffix[:6]}"
        audio_path.write_bytes(data)

    with jobs_lock:
        queued = sum(1 for j in jobs.values() if j["kind"] == "render" and j["status"] in ("queued", "running")) - 1
        if queued > 0:
            jobs[job_id]["message"] = f"В очереди (перед вами {queued})"
    render_pool.submit(_run_render, job_id, scenes, cfg, audio_path, tmp)
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Задача не найдена")
    return job


@app.get("/api/plan")
def plan(total: float = MIN_DURATION, clip: float = 5, transition: str = "crossfade"):
    """How many scenes are needed for the requested length."""
    total = max(MIN_DURATION, min(MAX_DURATION, total))
    td = 0 if transition == "none" else 0.8
    n = max(1, int(-(-(total - td) // max(1.0, clip - td))))
    d, T = plan_timeline(n, RenderSettings(total_duration=total, transition=transition))
    return {"scenes": n, "scene_duration": round(d, 2), "total": total}


@app.get("/api/videos")
def list_videos():
    items = []
    for m in sorted(VIDEOS.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            meta = json.loads(m.read_text())
        except Exception:
            continue
        vid = meta["id"]
        if (VIDEOS / f"{vid}.mp4").exists():
            meta["video"] = f"/videos/{vid}.mp4"
            meta["poster"] = f"/videos/{vid}.jpg"
            items.append(meta)
    return items[:50]


@app.delete("/api/videos/{vid}")
def delete_video(vid: str):
    _safe_id(vid)
    for ext in ("mp4", "jpg", "json"):
        (VIDEOS / f"{vid}.{ext}").unlink(missing_ok=True)
    return {"ok": True}


app.mount("/videos", StaticFiles(directory=VIDEOS), name="videos")
app.mount("/clips", StaticFiles(directory=CLIPS), name="clips")
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")
app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="static")
