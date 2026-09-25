"""Offline fallback artist: paints a stylised scene from the prompt text.

Used when the online image model (Pollinations) is unreachable. Keywords in
the prompt pick a palette and scene archetype; the prompt hash seeds the noise
so the same prompt always produces the same picture.
"""
from __future__ import annotations

import hashlib
import math

import numpy as np
from PIL import Image, ImageFilter

PALETTES = {
    # sky top, sky bottom, far hills, near hills, sun
    "sunset": [(40, 20, 70), (250, 120, 70), (120, 50, 90), (40, 15, 45), (255, 210, 120)],
    "night":  [(5, 8, 25), (30, 40, 90), (20, 25, 55), (8, 10, 22), (230, 235, 255)],
    "ocean":  [(30, 90, 160), (160, 210, 235), (40, 110, 160), (15, 60, 110), (255, 250, 220)],
    "forest": [(90, 150, 180), (210, 230, 200), (60, 110, 80), (20, 55, 35), (255, 245, 200)],
    "fire":   [(40, 5, 5), (230, 90, 20), (110, 25, 10), (30, 5, 5), (255, 200, 80)],
    "snow":   [(120, 150, 190), (230, 240, 250), (170, 190, 215), (230, 238, 248), (255, 255, 240)],
    "desert": [(80, 140, 200), (250, 210, 150), (210, 140, 80), (160, 90, 50), (255, 245, 210)],
    "cyber":  [(10, 0, 30), (200, 30, 150), (60, 20, 120), (10, 5, 30), (0, 240, 255)],
    "space":  [(2, 2, 10), (20, 10, 45), (0, 0, 0), (0, 0, 0), (255, 255, 255)],
}

KEYWORDS = {
    "sunset": ["sunset", "закат", "рассвет", "dawn", "sunrise", "вечер", "evening", "golden"],
    "night": ["night", "ночь", "ночн", "moon", "лун", "dark", "тёмн", "темн"],
    "ocean": ["ocean", "sea", "море", "океан", "water", "вода", "beach", "пляж", "wave", "волн"],
    "forest": ["forest", "лес", "tree", "дерев", "jungle", "джунгл", "green", "зелен"],
    "fire": ["fire", "огонь", "огн", "dragon", "дракон", "lava", "лава", "volcano", "вулкан", "hell"],
    "snow": ["snow", "снег", "winter", "зим", "ice", "лёд", "лед", "arctic", "мороз"],
    "desert": ["desert", "пустын", "sand", "песок", "песк", "egypt", "египет", "dune"],
    "cyber": ["cyber", "кибер", "neon", "неон", "city", "город", "future", "будущ", "robot", "робот"],
    "space": ["space", "космос", "космич", "galaxy", "галакт", "star", "звезд", "звёзд", "planet", "планет", "nebula"],
}


def _pick_palette(prompt: str) -> str:
    p = prompt.lower()
    best, score = None, 0
    for name, words in KEYWORDS.items():
        s = sum(p.count(wd) for wd in words)
        if s > score:
            best, score = name, s
    fallback = ["sunset", "ocean", "forest", "night", "desert"]
    return best or fallback[int(hashlib.md5(p.encode()).hexdigest(), 16) % len(fallback)]


def _ridge(w: int, rng: np.random.Generator, base: float, amp: float, rough: int) -> np.ndarray:
    x = np.linspace(0, 1, w)
    y = np.full(w, base)
    a = amp
    for o in range(rough):
        f = 2 ** o * rng.uniform(1.5, 2.5)
        y += a * np.sin(2 * np.pi * f * x + rng.uniform(0, 6.28))
        a *= 0.5
    return y


def _mix(c1, c2, t):
    t = np.asarray(t)[..., None]
    return np.array(c1) * (1 - t) + np.array(c2) * t


def paint(prompt: str, width: int = 1280, height: int = 720, seed: int = 0) -> Image.Image:
    h_int = int(hashlib.sha256(f"{prompt}|{seed}".encode()).hexdigest(), 16)
    rng = np.random.default_rng(h_int % (2 ** 32))
    pal_name = _pick_palette(prompt)
    top, bottom, far, near, sun = PALETTES[pal_name]
    w, h = width, height

    yy = np.linspace(0, 1, h)[:, None] * np.ones((1, w))
    img = _mix(top, bottom, yy ** 1.3)

    xx = np.linspace(0, 1, w)[None, :] * np.ones((h, 1))

    if pal_name in ("space", "night", "cyber"):
        # nebula clouds
        neb = np.zeros((h, w))
        for _ in range(6):
            cx, cy = rng.uniform(0, 1), rng.uniform(0, 0.7)
            r = rng.uniform(0.15, 0.45)
            neb += np.exp(-(((xx - cx) * w / h) ** 2 + (yy - cy) ** 2) / (r * r)) * rng.uniform(0.3, 1)
        hue = np.array([rng.uniform(80, 255), rng.uniform(20, 160), rng.uniform(120, 255)])
        img = img + (neb[..., None] * hue * (0.5 if pal_name != "space" else 0.8))
        # stars
        n = int(w * h / 900)
        sx, sy = rng.integers(0, w, n), rng.integers(0, int(h * 0.85), n)
        img[sy, sx] = np.minimum(255, img[sy, sx] + rng.uniform(120, 255, (n, 1)))

    # sun / moon with glow
    sx, sy = rng.uniform(0.2, 0.8), rng.uniform(0.18, 0.45)
    dist = np.sqrt(((xx - sx) * w / h) ** 2 + (yy - sy) ** 2)
    rad = rng.uniform(0.05, 0.09)
    glow = np.exp(-dist / (rad * 2.5)) * 0.6
    disc = np.clip((rad - dist) / 0.004, 0, 1)
    img = img * (1 - disc[..., None]) + np.array(sun) * disc[..., None]
    img = img + np.array(sun) * glow[..., None] * 0.6

    if pal_name == "space":
        # a planet instead of hills
        px, py, pr = rng.uniform(0.25, 0.75), rng.uniform(0.75, 1.1), rng.uniform(0.35, 0.55)
        pd = np.sqrt(((xx - px) * w / h) ** 2 + (yy - py) ** 2)
        body = np.clip((pr - pd) / 0.004, 0, 1)
        shade = np.clip(1.2 - ((xx - px + 0.2) ** 2 + (yy - py + 0.3) ** 2) * 2, 0.1, 1)
        pc = np.array([rng.uniform(60, 200), rng.uniform(60, 160), rng.uniform(120, 255)])
        bands = 0.85 + 0.15 * np.sin(yy * 60 + np.sin(xx * 8) * 2)
        img = img * (1 - body[..., None]) + (pc * (shade * bands)[..., None]) * body[..., None]
        atm = np.exp(-np.abs(pd - pr) / 0.012) * 0.7
        img = img + pc * atm[..., None]
    else:
        layers = [(0.55, 0.08, far, 5), (0.7, 0.07, _mix(far, near, 0.5).tolist(), 6), (0.85, 0.06, near, 7)]
        for i, (base, amp, col, rough) in enumerate(layers):
            ridge = _ridge(w, rng, base + rng.uniform(-0.05, 0.05), amp, rough)
            mask = (yy > ridge[None, :]).astype(np.float32)
            # atmospheric haze: far layers blend with the sky
            haze = 0.45 * (1 - i / len(layers))
            color = _mix(col, bottom, haze)
            img = img * (1 - mask[..., None]) + color * mask[..., None]
        if pal_name == "ocean":
            water = yy > 0.72
            ripple = 0.9 + 0.1 * np.sin(yy * 400 + np.sin(xx * 30) * 3)
            wc = _mix(top, bottom, 0.4) * ripple[..., None]
            img = np.where(water[..., None], wc, img)
        if pal_name == "cyber":
            # neon skyline
            x = 0
            while x < w:
                bw = int(rng.uniform(0.03, 0.08) * w)
                bh = rng.uniform(0.25, 0.6)
                y0 = int(h * (1 - bh))
                img[y0:, x:x + bw] = np.array([12, 6, 30])
                for wy in range(y0 + 8, h - 6, 14):
                    for wx in range(x + 5, x + bw - 5, 10):
                        if rng.random() < 0.35:
                            c = sun if rng.random() < 0.5 else bottom
                            img[wy:wy + 5, wx:wx + 4] = c
                x += bw + int(rng.uniform(0, 0.01) * w)

    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    return out.filter(ImageFilter.GaussianBlur(0.6))
