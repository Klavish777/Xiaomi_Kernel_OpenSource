"""AI video providers: turn a prompt (+ optional start frame) into a real motion clip.

* Pollinations  - gen.pollinations.ai/video  (Veo 3.1, Seedance 2.0, Wan, Nova Reel, ...)
* Runway        - api.dev.runwayml.com       (Gen-4.5, Gen-4 Turbo, Veo 3.1, Seedance 2)

Keys come from the environment (.env) or are passed per request from the UI.
Only the standard library is used for HTTP to keep dependencies minimal.
"""
from __future__ import annotations

import base64
import io
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable, Optional

from PIL import Image

UA = "Klavish/1.0 (+https://github.com/Klavish777)"

# ---- model catalogue: id -> (label, allowed durations) -------------------
POLLINATIONS_MODELS = {
    "bytedance/seedance-2.0":       ("Seedance 2.0 — топ качество", list(range(4, 16))),
    "google/veo-3.1-fast":          ("Google Veo 3.1 Fast", [4, 6, 8]),
    "alibaba/wan-2.7":              ("Wan 2.7", list(range(2, 16))),
    "alibaba/wan-2.2-fast":         ("Wan 2.2 Fast — дёшево", list(range(2, 16))),
    "bytedance/seedance-2.0-mini":  ("Seedance 2.0 Mini", list(range(4, 11))),
    "bytedance/seedance-2.0-fast":  ("Seedance 2.0 Fast", [4, 5]),
    "google/gemini-omni-1.1-flash": ("Gemini Omni Flash", list(range(3, 11))),
    "alibaba/wan-3.0":              ("Wan 3.0", [5]),
    "amazon/nova-reel-v1":          ("Amazon Nova Reel (до 120 с)", list(range(6, 121, 6))),
    "x-ai/grok-imagine-video-1.5":  ("Grok Imagine Video 1.5", list(range(1, 11))),
}
RUNWAY_MODELS = {
    "gen4.5":      ("Runway Gen-4.5", list(range(2, 11))),
    "gen4_turbo":  ("Runway Gen-4 Turbo (только из кадра)", [5, 10]),
    "veo3.1_fast": ("Veo 3.1 Fast (через Runway)", [4, 6, 8]),
    "seedance2":   ("Seedance 2 (через Runway)", list(range(4, 16))),
}


class ProviderError(RuntimeError):
    pass


def load_dotenv(path: Path) -> None:
    """Minimal .env loader (KEY=VALUE lines)."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def configured() -> dict:
    return {"pollinations": bool(os.getenv("POLLINATIONS_KEY")), "runway": bool(os.getenv("RUNWAYML_API_SECRET"))}


def nearest_duration(allowed: list[int], want: float) -> int:
    return min(allowed, key=lambda d: (abs(d - want), -d))


def _http(url: str, *, data: Optional[bytes] = None, headers: dict | None = None,
          method: str | None = None, timeout: int = 600) -> tuple[int, bytes, str]:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        body = e.read()[:1500].decode(errors="ignore")
        raise ProviderError(f"HTTP {e.code}: {body}") from None
    except urllib.error.URLError as e:
        raise ProviderError(f"Сеть недоступна: {e.reason}") from None


def _jpeg_bytes(img_bytes: bytes, max_side: int = 1280) -> bytes:
    im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    im.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Pollinations
# ---------------------------------------------------------------------------

def pollinations_video(prompt: str, out: Path, *, model: str, duration: int, aspect: str,
                       image_url: Optional[str], key: Optional[str], seed: int,
                       progress: Callable[[str], None]) -> Path:
    key = key or os.getenv("POLLINATIONS_KEY")
    if not key:
        raise ProviderError("Нужен ключ Pollinations (бесплатно: enter.pollinations.ai) — вставьте в ⚙️ Ключи или в .env")
    allowed = POLLINATIONS_MODELS.get(model, (None, list(range(2, 11))))[1]
    params = {"model": model, "duration": nearest_duration(allowed, duration),
              "aspectRatio": aspect if aspect in ("16:9", "9:16") else "16:9", "seed": seed % 2147483647}
    if image_url:
        params["image"] = image_url
    url = f"https://gen.pollinations.ai/video/{urllib.parse.quote(prompt[:1800])}?{urllib.parse.urlencode(params)}"
    progress(f"Pollinations · {model} · генерирую {params['duration']} с…")
    status, body, ctype = _http(url, headers={"Authorization": f"Bearer {key}"}, timeout=900)
    if "json" in ctype:  # some responses wrap the media
        try:
            j = json.loads(body)
            link = (j.get("data") or [{}])[0].get("url") or j.get("url")
            if link:
                _, body, ctype = _http(link, timeout=300)
        except Exception:
            raise ProviderError(f"Неожиданный ответ: {body[:300]!r}")
    if len(body) < 1000:
        raise ProviderError(f"Пустой ответ: {body[:300]!r}")
    out.write_bytes(body)
    return out


# ---------------------------------------------------------------------------
# Runway
# ---------------------------------------------------------------------------

RUNWAY_API = "https://api.dev.runwayml.com"
RUNWAY_VERSION = "2024-11-06"
RUNWAY_RATIOS = {"16:9": "1280:720", "9:16": "720:1280", "1:1": "960:960", "4:5": "832:1104"}


def runway_video(prompt: str, out: Path, *, model: str, duration: int, aspect: str,
                 image: Optional[bytes], key: Optional[str], seed: int,
                 progress: Callable[[str], None]) -> Path:
    key = key or os.getenv("RUNWAYML_API_SECRET")
    if not key:
        raise ProviderError("Нужен API-ключ Runway (dev.runwayml.com) — вставьте в ⚙️ Ключи или в .env")
    allowed = RUNWAY_MODELS.get(model, (None, list(range(2, 11))))[1]
    headers = {"Authorization": f"Bearer {key}", "X-Runway-Version": RUNWAY_VERSION,
               "Content-Type": "application/json"}
    body = {"model": model, "promptText": prompt[:1000], "duration": nearest_duration(allowed, duration),
            "seed": seed % 4294967295}
    if image is not None:
        body["promptImage"] = "data:image/jpeg;base64," + base64.b64encode(_jpeg_bytes(image)).decode()
        body["ratio"] = RUNWAY_RATIOS.get(aspect, "1280:720")
        endpoint = "/v1/image_to_video"
    else:
        if model == "gen4_turbo":
            raise ProviderError("Gen-4 Turbo работает только из стартового кадра")
        body["ratio"] = "720:1280" if aspect == "9:16" else "1280:720"
        endpoint = "/v1/text_to_video"

    progress(f"Runway · {model} · отправляю задачу…")
    _, resp, _ = _http(RUNWAY_API + endpoint, data=json.dumps(body).encode(), headers=headers, method="POST", timeout=120)
    task_id = json.loads(resp)["id"]
    t0 = time.time()
    while True:
        time.sleep(5)
        _, resp, _ = _http(f"{RUNWAY_API}/v1/tasks/{task_id}", headers=headers, timeout=60)
        task = json.loads(resp)
        st = task.get("status")
        if st == "SUCCEEDED":
            break
        if st in ("FAILED", "CANCELLED"):
            raise ProviderError(f"Runway: {task.get('failure') or st} {task.get('failureCode') or ''}".strip())
        pct = task.get("progress")
        progress(f"Runway · {model} · {st or '…'}" + (f" {int(float(pct) * 100)}%" if pct else "") +
                 f" · {int(time.time() - t0)} с")
        if time.time() - t0 > 1200:
            raise ProviderError("Runway: превышено время ожидания")
    _, video, _ = _http(task["output"][0], timeout=300)
    out.write_bytes(video)
    return out
