"""Video renderer: turns a list of still frames into a cinematic MP4.

Every frame is composed in Python (Pillow + NumPy) and piped as raw RGB into
ffmpeg, which gives smooth sub-pixel camera motion, soft transitions,
colour grading, animated captions and a soundtrack - all fully offline.
"""
from __future__ import annotations

import math
import random
import subprocess
import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, List, Optional

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ASSETS = Path(__file__).resolve().parent.parent / "assets"
FONT_BOLD = ASSETS / "fonts" / "DejaVuSans-Bold.ttf"

RESOLUTIONS = {
    "16:9": (1280, 720),
    "9:16": (720, 1280),
    "1:1": (1080, 1080),
    "4:5": (864, 1080),
}

MOTIONS = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"]
TRANSITIONS = ["crossfade", "black", "slide", "wipe", "zoom", "none"]
GRADES = ["none", "cinematic", "warm", "cold", "noir", "vintage", "vivid"]


@dataclass
class Scene:
    image: Image.Image
    caption: str = ""
    motion: str = "auto"


@dataclass
class RenderSettings:
    aspect: str = "16:9"
    fps: int = 24
    scene_duration: float = 4.0
    transition: str = "crossfade"
    transition_duration: float = 0.8
    motion: str = "auto"
    grade: str = "cinematic"
    captions: bool = True
    title: str = ""
    seed: int = 0
    audio_path: Optional[Path] = None
    extra: dict = field(default_factory=dict)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _font(size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(str(FONT_BOLD), size)
    except OSError:  # pragma: no cover - fallback if font missing
        return ImageFont.load_default()


def _ease(p: float) -> float:
    """Mostly linear with gentle ease at the ends (no dead stops)."""
    return 0.75 * p + 0.25 * (0.5 - 0.5 * math.cos(math.pi * p))


def _cover(img: Image.Image, w: int, h: int, margin: float) -> Image.Image:
    """Resize so the image covers w*h scaled by margin (room for motion)."""
    tw, th = int(w * margin), int(h * margin)
    return ImageOps.fit(img.convert("RGB"), (tw, th), Image.LANCZOS)


# --------------------------------------------------------------------------
# colour grading (applied once per scene, cheap)
# --------------------------------------------------------------------------

def _vignette(w: int, h: int, strength: float = 0.45) -> np.ndarray:
    y, x = np.ogrid[-1:1:complex(0, h), -1:1:complex(0, w)]
    r = np.sqrt(x * x + y * y) / math.sqrt(2)
    v = 1.0 - strength * np.clip((r - 0.35) / 0.65, 0, 1) ** 1.6
    return v[..., None].astype(np.float32)


def grade_image(img: Image.Image, grade: str) -> Image.Image:
    if grade == "none":
        return img
    a = np.asarray(img).astype(np.float32) / 255.0
    lum = (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2])[..., None]

    if grade == "cinematic":  # teal shadows, orange highlights, soft contrast
        shadows = np.clip(1 - lum * 2, 0, 1)
        highs = np.clip(lum * 2 - 1, 0, 1)
        a = a + shadows * np.array([-0.04, 0.02, 0.06]) + highs * np.array([0.07, 0.02, -0.05])
        a = 0.5 + (a - 0.5) * 1.12
        a = a * 0.9 + lum * 0.1
    elif grade == "warm":
        a = a * np.array([1.08, 1.0, 0.88]) + 0.02
    elif grade == "cold":
        a = a * np.array([0.9, 0.98, 1.1])
    elif grade == "noir":
        a = np.repeat(lum, 3, axis=2)
        a = 0.5 + (a - 0.5) * 1.35
    elif grade == "vintage":
        sep = np.concatenate([lum * 1.07 + 0.05, lum * 0.95 + 0.03, lum * 0.75], axis=2)
        a = a * 0.35 + sep * 0.65
        a = 0.08 + a * 0.86  # lifted blacks, faded highlights
    elif grade == "vivid":
        a = lum + (a - lum) * 1.35
        a = 0.5 + (a - 0.5) * 1.08

    if grade in ("cinematic", "noir", "vintage"):
        h, w = a.shape[:2]
        a = a * _vignette(w, h, 0.5 if grade != "cinematic" else 0.35)

    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


# --------------------------------------------------------------------------
# text overlays
# --------------------------------------------------------------------------

def _caption_layer(text: str, w: int, h: int) -> Optional[Image.Image]:
    text = (text or "").strip()
    if not text:
        return None
    size = max(22, int(min(w, h) * 0.045))
    font = _font(size)
    max_chars = max(14, int(w / (size * 0.58)))
    lines = textwrap.wrap(text, width=max_chars)[:3]
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    line_h = int(size * 1.3)
    block_h = line_h * len(lines)
    y0 = int(h * 0.9) - block_h
    # soft gradient behind the text for legibility
    grad_h = block_h + int(h * 0.16)
    grad = np.linspace(0, 170, grad_h, dtype=np.float32)[:, None]
    grad = np.repeat(grad, w, axis=1).astype(np.uint8)
    shade = Image.new("RGBA", (w, grad_h), (0, 0, 0, 0))
    shade.putalpha(Image.fromarray(grad))
    layer.alpha_composite(shade, (0, h - grad_h))
    for i, line in enumerate(lines):
        tw = d.textlength(line, font=font)
        x = (w - tw) / 2
        y = y0 + i * line_h
        d.text((x + 2, y + 2), line, font=font, fill=(0, 0, 0, 160))
        d.text((x, y), line, font=font, fill=(255, 255, 255, 255))
    return layer


def _title_layer(text: str, w: int, h: int) -> Optional[Image.Image]:
    text = (text or "").strip()
    if not text:
        return None
    size = max(34, int(min(w, h) * 0.085))
    font = _font(size)
    lines = textwrap.wrap(text, width=max(10, int(w / (size * 0.6))))[:3]
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d, g = ImageDraw.Draw(layer), ImageDraw.Draw(glow)
    line_h = int(size * 1.2)
    y0 = (h - line_h * len(lines)) // 2
    for i, line in enumerate(lines):
        tw = d.textlength(line, font=font)
        x, y = (w - tw) / 2, y0 + i * line_h
        g.text((x, y), line, font=font, fill=(0, 0, 0, 230))
        d.text((x, y), line, font=font, fill=(255, 255, 255, 255))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.25))
    glow.alpha_composite(layer)
    return glow


def _apply_layer(frame: Image.Image, layer: Image.Image, alpha: float) -> Image.Image:
    if alpha <= 0.01:
        return frame
    if alpha < 0.99:
        la = layer.getchannel("A").point(lambda v: int(v * alpha))
        layer = layer.copy()
        layer.putalpha(la)
    base = frame.convert("RGBA")
    base.alpha_composite(layer)
    return base.convert("RGB")


# --------------------------------------------------------------------------
# camera motion
# --------------------------------------------------------------------------

MARGIN = 1.22


def _motion_frame(src: Image.Image, motion: str, p: float, w: int, h: int) -> Image.Image:
    """Crop a moving window out of `src` (which is w*h*MARGIN)."""
    sw, sh = src.size
    p = _ease(p)
    if motion == "zoom_in":
        z = 1.0 + (MARGIN - 1.0) * p          # zoom from full view to tight
        cw, ch = sw / z, sh / z
        cx, cy = sw / 2, sh / 2
    elif motion == "zoom_out":
        z = MARGIN - (MARGIN - 1.0) * p
        cw, ch = sw / z, sh / z
        cx, cy = sw / 2, sh / 2
    else:
        z = MARGIN * 0.97
        cw, ch = sw / z, sh / z
        free_x, free_y = (sw - cw) / 2, (sh - ch) / 2
        cx, cy = sw / 2, sh / 2
        if motion == "pan_left":
            cx += free_x * (1 - 2 * p)
        elif motion == "pan_right":
            cx += free_x * (2 * p - 1)
        elif motion == "pan_up":
            cy += free_y * (1 - 2 * p)
        elif motion == "pan_down":
            cy += free_y * (2 * p - 1)
    box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
    return src.resize((w, h), Image.BILINEAR, box=box)


# --------------------------------------------------------------------------
# transitions
# --------------------------------------------------------------------------

def _transition(a: Image.Image, b: Image.Image, t: float, kind: str) -> Image.Image:
    w, h = a.size
    s = 0.5 - 0.5 * math.cos(math.pi * t)  # smooth 0..1
    if kind == "black":
        if t < 0.5:
            return Image.blend(a, Image.new("RGB", a.size), min(1, t * 2))
        return Image.blend(Image.new("RGB", a.size), b, min(1, (t - 0.5) * 2))
    if kind == "slide":
        out = Image.new("RGB", (w, h))
        off = int(w * s)
        out.paste(a, (-off, 0))
        out.paste(b, (w - off, 0))
        return out
    if kind == "wipe":
        edge = int(w * 0.12)
        x = np.arange(w, dtype=np.float32)
        pos = s * (w + edge) - edge
        m = np.clip((pos + edge - x) / edge, 0, 1)
        mask = Image.fromarray((np.repeat(m[None, :], h, axis=0) * 255).astype(np.uint8))
        return Image.composite(b, a, mask)
    if kind == "zoom":
        z = 1 + 0.25 * s
        cw, ch = w / z, h / z
        az = a.resize((w, h), Image.BILINEAR, box=((w - cw) / 2, (h - ch) / 2, (w + cw) / 2, (h + ch) / 2))
        return Image.blend(az, b, s)
    return Image.blend(a, b, s)


# --------------------------------------------------------------------------
# main render
# --------------------------------------------------------------------------

def render_video(
    scenes: List[Scene],
    out_path: Path,
    settings: RenderSettings,
    progress: Callable[[float, str], None] = lambda p, m: None,
    music_path: Optional[Path] = None,
) -> Path:
    if not scenes:
        raise ValueError("Нет сцен для рендера")

    w, h = RESOLUTIONS.get(settings.aspect, RESOLUTIONS["16:9"])
    fps = int(max(12, min(60, settings.fps)))
    d = float(max(1.5, min(20.0, settings.scene_duration)))
    kind = settings.transition if settings.transition in TRANSITIONS else "crossfade"
    T = 0.0 if kind == "none" or len(scenes) == 1 else float(min(settings.transition_duration, d * 0.45))
    step = d - T
    total = step * (len(scenes) - 1) + d
    n_frames = int(round(total * fps))

    rng = random.Random(settings.seed)
    progress(0.02, "Подготовка кадров")

    prepared = []
    last_motion = None
    for i, sc in enumerate(scenes):
        src = _cover(sc.image, w, h, MARGIN)
        src = grade_image(src, settings.grade)
        motion = sc.motion if sc.motion in MOTIONS else settings.motion
        if motion not in MOTIONS:
            motion = rng.choice([m for m in MOTIONS if m != last_motion])
        last_motion = motion
        cap = _caption_layer(sc.caption, w, h) if settings.captions else None
        prepared.append((src, motion, cap))

    title = _title_layer(settings.title, w, h)

    # film grain for the vintage look (pre-generated, cycled)
    grain = None
    if settings.grade == "vintage":
        g_rng = np.random.default_rng(settings.seed)
        grain = [g_rng.normal(0, 9, (h, w, 1)).astype(np.float32) for _ in range(6)]

    def scene_frame(i: int, local_t: float) -> Image.Image:
        src, motion, cap = prepared[i]
        fr = _motion_frame(src, motion, min(1.0, max(0.0, local_t / d)), w, h)
        if cap is not None:
            fade = 0.45
            a = min(1.0, max(0.0, (local_t - 0.25) / fade), max(0.0, (d - 0.15 - local_t) / fade))
            fr = _apply_layer(fr, cap, a)
        if i == 0 and title is not None:
            end = min(3.2, d - 0.3)
            a = min(1.0, max(0.0, (local_t - 0.2) / 0.6), max(0.0, (end - local_t) / 0.6))
            fr = _apply_layer(fr, title, a)
        return fr

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ffmpeg, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-"]
    audio = settings.audio_path or music_path
    if audio is not None:
        if settings.audio_path is not None:
            cmd += ["-stream_loop", "-1"]
        cmd += ["-i", str(audio)]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart"]
    if audio is not None:
        fade_st = max(0.0, total - 1.5)
        cmd += ["-c:a", "aac", "-b:a", "160k", "-map", "0:v:0", "-map", "1:a:0",
                "-af", f"afade=t=in:st=0:d=0.8,afade=t=out:st={fade_st:.2f}:d=1.5",
                "-t", f"{total:.3f}"]
    cmd += [str(out_path)]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for f in range(n_frames):
            t = f / fps
            i = min(int(t // step) if step > 0 else 0, len(scenes) - 1)
            local = t - i * step
            if T > 0 and i + 1 < len(scenes) and local >= step:
                frame = _transition(scene_frame(i, local), scene_frame(i + 1, local - step),
                                    (local - step) / T, kind)
            else:
                frame = scene_frame(i, local)
            if grain is not None:
                arr = np.asarray(frame).astype(np.float32) + grain[f % len(grain)]
                frame = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
            proc.stdin.write(frame.tobytes())
            if f % 6 == 0:
                progress(0.05 + 0.9 * f / n_frames, f"Рендер кадра {f + 1} из {n_frames}")
        proc.stdin.close()
        err = proc.stderr.read().decode(errors="ignore")
        if proc.wait() != 0:
            raise RuntimeError(f"ffmpeg завершился с ошибкой: {err[-800:]}")
    except BrokenPipeError:
        err = proc.stderr.read().decode(errors="ignore")
        raise RuntimeError(f"ffmpeg оборвал поток: {err[-800:]}")
    finally:
        if proc.poll() is None:
            proc.kill()

    progress(1.0, "Готово")
    return out_path
