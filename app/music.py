"""Tiny procedural soundtrack synthesizer (pads + bass + pulse), no samples needed."""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 44100

# Chord progressions as semitone offsets from A2 (110 Hz)
MOODS = {
    "epic":   {"bpm": 80,  "chords": [[0, 7, 12, 15], [-4, 3, 8, 12], [-9, -2, 3, 7], [-2, 5, 10, 14]], "pulse": True,  "bright": 0.5},
    "calm":   {"bpm": 64,  "chords": [[3, 10, 15, 19], [-2, 5, 10, 14], [0, 7, 12, 15], [-4, 3, 8, 15]],  "pulse": False, "bright": 0.3},
    "dark":   {"bpm": 60,  "chords": [[0, 7, 12, 15], [1, 8, 13, 16], [-4, 3, 8, 12], [-5, 2, 7, 11]],    "pulse": True,  "bright": 0.2},
    "happy":  {"bpm": 104, "chords": [[3, 10, 15, 19], [10, 14, 17, 22], [0, 7, 12, 15], [8, 12, 15, 20]], "pulse": True,  "bright": 0.7},
    "dreamy": {"bpm": 70,  "chords": [[3, 10, 14, 19], [8, 15, 19, 22], [0, 7, 14, 17], [5, 12, 16, 21]],  "pulse": False, "bright": 0.45},
}


def _freq(semi: float) -> float:
    return 110.0 * 2 ** (semi / 12.0)


def _pad(freq: float, n: int, bright: float, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(n) / SR
    out = np.zeros(n)
    for detune in (-0.12, 0.0, 0.11):
        f = freq * 2 ** (detune / 12)
        ph = rng.uniform(0, 2 * np.pi)
        out += np.sin(2 * np.pi * f * t + ph)
        out += bright * 0.35 * np.sin(4 * np.pi * f * t + ph)
        out += bright * 0.12 * np.sin(6 * np.pi * f * t + ph)
    return out / 3


def synth_music(duration: float, mood: str, path: Path, seed: int = 0) -> Path:
    cfg = MOODS.get(mood, MOODS["calm"])
    rng = np.random.default_rng(seed)
    total = int((duration + 1.0) * SR)
    beat = 60.0 / cfg["bpm"]
    bar = int(beat * 4 * SR)
    mix = np.zeros(total + bar)
    xf = int(0.6 * SR)  # chord overlap for smooth changes

    pos, k = 0, 0
    while pos < total:
        chord = cfg["chords"][k % len(cfg["chords"])]
        n = bar + xf
        env = np.ones(n)
        env[:xf] = np.linspace(0, 1, xf) ** 1.5
        env[-xf:] = np.linspace(1, 0, xf) ** 1.5
        seg = np.zeros(n)
        for s in chord:
            seg += _pad(_freq(s + 12), n, cfg["bright"], rng) * 0.16
        # sub bass on the root
        t = np.arange(n) / SR
        seg += 0.22 * np.sin(2 * np.pi * _freq(chord[0] - 12) * t)
        if cfg["pulse"]:
            # soft eighth-note pulse on the fifth, like a heartbeat arpeggio
            step = int(beat / 2 * SR)
            for j in range(0, n - step, step):
                m = min(step, n - j)
                tt = np.arange(m) / SR
                note = chord[(j // step) % len(chord)] + 24
                seg[j:j + m] += 0.07 * np.sin(2 * np.pi * _freq(note) * tt) * np.exp(-tt * 7)
        mix[pos:pos + n] += seg * env
        pos += bar
        k += 1

    mix = mix[:total]
    # simple feedback delay for space
    d = int(0.33 * SR)
    for _ in range(3):
        mix[d:] += 0.28 * mix[:-d]
    # stereo width via small offset
    left = mix
    right = np.concatenate([np.zeros(300), mix[:-300]])
    stereo = np.stack([left, right], axis=1)
    stereo /= max(1e-6, np.abs(stereo).max()) / 0.8
    pcm = (stereo * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())
    return path
