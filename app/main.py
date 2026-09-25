"""Genius Video AI - FastAPI backend.

Run:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import io
import json
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

from . import procedural
from .music import MOODS, synth_music
from .render import GRADES, MOTIONS, RESOLUTIONS, TRANSITIONS, RenderSettings, Scene, render_video

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
VIDEOS = DATA / "videos"
WORK = DATA / "work"
for p in (VIDEOS, WORK):
    p.mkdir(parents=True, exist_ok=True)

MAX_SCENES = 16
MAX_UPLOAD = 25 * 1024 * 1024  # 25 MB per file

app = FastAPI(title="Genius Video AI")
executor = ThreadPoolExecutor(max_workers=1)  # one render at a time: CPU friendly
jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


def _update(job_id: str, **kw) -> None:
    with jobs_lock:
        jobs[job_id].update(kw)


@app.get("/api/health")
def health():
    import imageio_ffmpeg
    return {"ok": True, "ffmpeg": imageio_ffmpeg.get_ffmpeg_version()}


@app.get("/api/options")
def options():
    return {
        "aspects": list(RESOLUTIONS), "motions": MOTIONS, "transitions": TRANSITIONS,
        "grades": GRADES, "moods": list(MOODS),
    }


@app.get("/api/procedural")
def procedural_image(prompt: str = Query("", max_length=2000), w: int = 1280, h: int = 720, seed: int = 0):
    w, h = max(256, min(w, 1920)), max(256, min(h, 1920))
    img = procedural.paint(prompt, w, h, seed)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=92)
    return Response(buf.getvalue(), media_type="image/jpeg")


def _run_job(job_id: str, scene_files: List[Path], config: dict, audio: Optional[Path]):
    try:
        _update(job_id, status="running", message="Старт рендера", progress=0.01)
        scenes = []
        caps = config.get("scenes", [])
        for i, f in enumerate(scene_files):
            img = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
            meta = caps[i] if i < len(caps) else {}
            scenes.append(Scene(image=img, caption=str(meta.get("caption", ""))[:300],
                                motion=str(meta.get("motion", "auto"))))

        s = RenderSettings(
            aspect=config.get("aspect", "16:9"),
            fps=int(config.get("fps", 24)),
            scene_duration=float(config.get("scene_duration", 4)),
            transition=config.get("transition", "crossfade"),
            transition_duration=float(config.get("transition_duration", 0.8)),
            motion=config.get("motion", "auto"),
            grade=config.get("grade", "cinematic"),
            captions=bool(config.get("captions", True)),
            title=str(config.get("title", ""))[:120],
            seed=int(config.get("seed", 0)) % (2 ** 31),
            audio_path=audio,
        )

        music = None
        mood = config.get("music", "none")
        if audio is None and mood in MOODS:
            _update(job_id, message="Сочиняю саундтрек", progress=0.02)
            n = len(scenes)
            T = 0 if s.transition == "none" or n == 1 else min(s.transition_duration, s.scene_duration * 0.45)
            total = (s.scene_duration - T) * (n - 1) + s.scene_duration
            music = synth_music(total, mood, WORK / f"{job_id}.wav", seed=s.seed)

        out = VIDEOS / f"{job_id}.mp4"
        render_video(scenes, out, s, lambda p, m: _update(job_id, progress=round(p, 3), message=m), music)

        # poster + metadata for the gallery
        scenes[0].image.copy().convert("RGB").resize(
            (480, int(480 * scenes[0].image.height / scenes[0].image.width))).save(VIDEOS / f"{job_id}.jpg", quality=85)
        meta = {"id": job_id, "title": s.title or (caps[0].get("caption", "") if caps else ""),
                "created": time.time(), "aspect": s.aspect, "scenes": len(scenes)}
        (VIDEOS / f"{job_id}.json").write_text(json.dumps(meta, ensure_ascii=False))
        _update(job_id, status="done", progress=1.0, message="Готово!", video=f"/videos/{job_id}.mp4")
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        _update(job_id, status="error", message=str(e))
    finally:
        for f in scene_files:
            f.unlink(missing_ok=True)
        if audio:
            audio.unlink(missing_ok=True)
        (WORK / f"{job_id}.wav").unlink(missing_ok=True)


@app.post("/api/render")
async def render(config: str = Form(...), images: List[UploadFile] = File(...),
                 audio: Optional[UploadFile] = File(None)):
    try:
        cfg = json.loads(config)
    except json.JSONDecodeError:
        raise HTTPException(400, "config должен быть JSON")
    if not images:
        raise HTTPException(400, "Нужна хотя бы одна картинка")
    if len(images) > MAX_SCENES:
        raise HTTPException(400, f"Максимум {MAX_SCENES} сцен")

    job_id = uuid.uuid4().hex[:12]
    files = []
    for i, up in enumerate(images):
        data = await up.read()
        if len(data) > MAX_UPLOAD:
            raise HTTPException(413, "Файл слишком большой")
        try:
            Image.open(io.BytesIO(data)).verify()
        except Exception:
            raise HTTPException(400, f"Сцена {i + 1}: файл не является изображением")
        p = WORK / f"{job_id}_{i:02d}.img"
        p.write_bytes(data)
        files.append(p)

    audio_path = None
    if audio is not None and audio.filename:
        data = await audio.read()
        if len(data) > MAX_UPLOAD * 2:
            raise HTTPException(413, "Аудиофайл слишком большой")
        audio_path = WORK / f"{job_id}_audio{Path(audio.filename).suffix[:6]}"
        audio_path.write_bytes(data)

    with jobs_lock:
        queued = sum(1 for j in jobs.values() if j["status"] in ("queued", "running"))
        jobs[job_id] = {"id": job_id, "status": "queued", "progress": 0.0,
                        "message": "В очереди" + (f" (перед вами {queued})" if queued else "")}
    executor.submit(_run_job, job_id, files, cfg, audio_path)
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Задача не найдена")
    return job


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
    if not vid.isalnum():
        raise HTTPException(400, "bad id")
    for ext in ("mp4", "jpg", "json"):
        (VIDEOS / f"{vid}.{ext}").unlink(missing_ok=True)
    return {"ok": True}


app.mount("/videos", StaticFiles(directory=VIDEOS), name="videos")
app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="static")
