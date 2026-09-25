"""Smoke tests: API, planning, offline artist and a real (short) render."""
import json
import os
import tempfile
from io import BytesIO

os.environ.setdefault("KLAVISH_DATA", tempfile.mkdtemp(prefix="klavish-test-"))

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app import providers  # noqa: E402
from app.main import app  # noqa: E402
from app.render import RenderSettings, plan_timeline  # noqa: E402

client = TestClient(app)


def test_health_and_ui():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["app"] == "Klavish"
    assert "Klavish" in client.get("/").text


def test_options_list_models():
    o = client.get("/api/options").json()
    assert o["min_duration"] == 15
    assert "gen4.5" in o["models"]["runway"]
    assert "bytedance/seedance-2.0" in o["models"]["pollinations"]


def test_plan_hits_requested_length():
    for total in (15, 30, 47, 120):
        p = client.get(f"/api/plan?total={total}&clip=5").json()
        d, T = plan_timeline(p["scenes"], RenderSettings(total_duration=total))
        assert abs((d - T) * (p["scenes"] - 1) + d - total) < 1e-6
    assert client.get("/api/plan?total=3").json()["total"] == 15  # minimum enforced


def test_nearest_duration():
    assert providers.nearest_duration([4, 6, 8], 7) == 8
    assert providers.nearest_duration([5, 10], 5) == 5


def test_procedural_image():
    r = client.get("/api/procedural", params={"prompt": "космос", "w": 512, "h": 288})
    assert r.status_code == 200
    assert Image.open(BytesIO(r.content)).size == (512, 288)


def test_clip_without_key_reports_error():
    j = client.post("/api/clip", data={"provider": "pollinations", "model": "alibaba/wan-2.7", "prompt": "x"}).json()
    import time
    for _ in range(50):
        s = client.get(f"/api/jobs/{j['job_id']}").json()
        if s["status"] != "queued" and s["status"] != "running":
            break
        time.sleep(0.1)
    assert s["status"] == "error" and "ключ" in s["message"].lower()


def test_full_render_is_exactly_15_seconds():
    img = BytesIO()
    Image.new("RGB", (640, 360), (200, 80, 40)).save(img, "JPEG")
    cfg = {"total_duration": 15, "fps": 12, "music": "calm", "title": "Klavish",
           "scenes": [{"caption": "Тест", "media": 0}, {"caption": "Два", "media": 1}]}
    files = [("media", ("a.jpg", img.getvalue(), "image/jpeg")), ("media", ("b.jpg", img.getvalue(), "image/jpeg"))]
    j = client.post("/api/render", data={"config": json.dumps(cfg)}, files=files).json()
    import time
    for _ in range(600):
        s = client.get(f"/api/jobs/{j['job_id']}").json()
        if s["status"] in ("done", "error"):
            break
        time.sleep(0.2)
    assert s["status"] == "done", s
    import imageio_ffmpeg
    path = os.path.join(os.environ["KLAVISH_DATA"], "videos", f"{j['job_id']}.mp4")
    _, secs = imageio_ffmpeg.count_frames_and_secs(path)
    assert abs(secs - 15) < 0.2
