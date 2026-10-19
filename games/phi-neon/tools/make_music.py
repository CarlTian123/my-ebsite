#!/usr/bin/env python3
"""
PHI:NEON — original soundtrack generator.
Two 90-second tracks, synthesized from scratch with numpy/scipy.

  python3 tools/make_music.py neon-pulse
  python3 tools/make_music.py frostlight
  python3 tools/make_music.py all

Outputs: audio/<id>.wav (44.1k / 16 bit stereo), then encodes m4a with afconvert.
"""
import json
import math
import os
import subprocess
import sys
import wave

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d, uniform_filter1d

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "audio")
DATA = os.path.join(ROOT, "data")
os.makedirs(AUDIO, exist_ok=True)
os.makedirs(DATA, exist_ok=True)

rng = np.random.default_rng(20261018)


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def tt(n):
    return np.arange(n, dtype=np.float64) / SR


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.2, curve=2.0):
    """Envelope of n samples. a/d/r in seconds, s = sustain level."""
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = max(1, na)
    nd = max(1, nd)
    nr = max(1, min(nr, n))
    env = np.ones(n, dtype=np.float64) * s
    if na + nd < n:
        env[:na] = np.linspace(0, 1, na, endpoint=False) ** 0.7
        env[na:na + nd] = 1 + (s - 1) * (np.linspace(0, 1, nd, endpoint=False) ** 0.8)
    else:
        env[:n] = np.linspace(0, 1, n) ** 0.7
    # release curve on the tail
    if nr > 1:
        env[-nr:] *= np.linspace(1, 0, nr) ** curve
    return env


def exp_env(n, decay=6.0):
    return np.exp(-tt(n) * decay)


def saw(phase):
    return 2.0 * (phase - np.floor(phase + 0.5))


def sine(phase):
    return np.sin(2 * np.pi * phase)


def square(phase):
    return np.sign(np.sin(2 * np.pi * phase))


def tri(phase):
    return 2.0 * np.abs(2.0 * (phase - np.floor(phase + 0.5))) - 1.0


def phase_of(freq, n, phase0=0.0):
    """freq may be scalar or array (per-sample Hz)."""
    if np.isscalar(freq):
        return phase0 + freq * tt(n)
    f = np.asarray(freq, dtype=np.float64)
    return phase0 + np.cumsum(f) / SR


def bp(sig, lo, hi, order=2):
    sos = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], btype="band", output="sos")
    return signal.sosfilt(sos, sig)


def lp(sig, cutoff, order=2):
    cutoff = min(max(cutoff, 20.0), SR * 0.45)
    sos = signal.butter(order, cutoff / (SR / 2), btype="low", output="sos")
    return signal.sosfilt(sos, sig)


def hp(sig, cutoff, order=2):
    cutoff = min(max(cutoff, 15.0), SR * 0.45)
    sos = signal.butter(order, cutoff / (SR / 2), btype="high", output="sos")
    return signal.sosfilt(sos, sig)


def pan2(sig, pan=0.0):
    """constant-power pan, -1..1"""
    a = (pan + 1) * math.pi / 4
    return np.stack([sig * math.cos(a), sig * math.sin(a)], axis=1)


class Mixer:
    def __init__(self, seconds):
        self.seconds = seconds
        self.n = int(seconds * SR)
        self.bus = {}

    def get(self, name):
        if name not in self.bus:
            self.bus[name] = np.zeros((self.n + SR * 3, 2), dtype=np.float64)
        return self.bus[name]

    def add(self, name, t, sig, gain=1.0, pan=0.0):
        if gain <= 0:
            return
        buf = self.get(name)
        s = int(round(t * SR))
        if s >= len(buf):
            return
        if sig.ndim == 1:
            sig = pan2(sig, pan) * math.sqrt(2)
        else:
            sig = sig * math.sqrt(2)
        e = min(s + len(sig), len(buf))
        if e > s:
            buf[s:e] += sig[: e - s] * gain

    def send(self, src, dst, gain, predelay=0.0):
        """copy a bus into another (reverb send)"""
        a = self.get(src)
        b = self.get(dst)
        d = int(predelay * SR)
        if gain == 0:
            return
        if d == 0:
            b[: len(a)] += a * gain
        else:
            b[d:] += a[: len(b) - d] * gain

    def finish(self):
        mix = np.zeros((self.n, 2), dtype=np.float64)
        for name, buf in self.bus.items():
            mix += buf[: self.n]
        return mix


# ----------------------------------------------------------------------------
# instruments
# ----------------------------------------------------------------------------
def kick(style="dnb", length=0.55):
    n = int(length * SR)
    t = tt(n)
    if style == "soft":
        f = 42 + 55 * np.exp(-t * 35)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
        body = np.tanh(body * 2.0)
        click = hp(rng.normal(0, 1, n), 2500) * np.exp(-t * 180) * 0.10
    else:
        f = 46 + 150 * np.exp(-t * 42)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8.0)
        body = np.tanh(body * 3.4)
        click = hp(rng.normal(0, 1, n), 1800) * np.exp(-t * 240) * 0.22
    return (body + click) * 0.92


def snare(style="dnb", length=0.32):
    n = int(length * SR)
    t = tt(n)
    noise = rng.normal(0, 1, n)
    body = bp(noise, 900, 7800) * np.exp(-t * 15)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 24) * 0.5
    tone += np.sin(2 * np.pi * 278 * t) * np.exp(-t * 30) * 0.22
    sig = body * 0.75 + tone
    if style == "big":
        sig = bp(sig, 500, 9000)
        sig *= 1.2
    return sig * 0.8


def clap(length=0.3):
    n = int(length * SR)
    t = tt(n)
    out = np.zeros(n)
    for i, off in enumerate((0.0, 0.012, 0.026, 0.041)):
        s = int(off * SR)
        e = min(n, s + int(0.10 * SR))
        noise = bp(rng.normal(0, 1, e - s), 900, 6500)
        env = np.exp(-np.arange(e - s) / SR * (55 if i < 3 else 22))
        out[s:e] += noise * env
    return out * 0.7


def hat(open_=False):
    n = int((0.28 if open_ else 0.055) * SR)
    t = tt(n)
    noise = rng.normal(0, 1, n)
    sig = hp(noise, 7200, order=3)
    sig = bp(sig, 6000, 15000) * np.exp(-t * (11 if open_ else 75))
    return sig * (0.5 if open_ else 0.38)


def crash(length=2.0):
    n = int(length * SR)
    t = tt(n)
    noise = rng.normal(0, 1, n)
    sig = hp(noise, 3500)
    sig += bp(rng.normal(0, 1, n), 1200, 3500) * 0.3
    return sig * np.exp(-t * 3.0) * 0.55


def impact(length=2.6):
    n = int(length * SR)
    t = tt(n)
    f = 28 + 70 * np.exp(-t * 5)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.4)
    noise = lp(rng.normal(0, 1, n), 900) * np.exp(-t * 4) * 0.35
    return np.tanh((boom + noise) * 1.8)


def supersaw(freq, n, detune=0.09, voices=5, phase0=0.0, width=0.8):
    """detuned saw stack, returns stereo (n,2)."""
    left = np.zeros(n)
    right = np.zeros(n)
    for i in range(voices):
        d = (i - (voices - 1) / 2) / max(1, (voices - 1) / 2)
        cents = d * detune * 100
        f = freq * 2 ** (cents / 1200)
        p = phase_of(f, n, phase0 + i * 0.37)
        v = saw(p)
        l = 1.0
        r = 1.0
        if width > 0:
            l = 0.6 + 0.4 * (1 - d) * width
            r = 0.6 + 0.4 * (1 + d) * width
        left += v * l
        right += v * r
    left /= voices
    right /= voices
    return np.stack([left, right], axis=1)


def lead_note(midi, dur, bright=1.0, gain=1.0, vib=0.0, voices=5):
    n = int((dur + 0.35) * SR)
    t = tt(n)
    f = hz(midi)
    fr = np.full(n, f)
    if vib:
        fr = fr * (1 + vib * np.sin(2 * np.pi * 5.4 * t + rng.uniform(0, 6)))
    # generate with a single phase family: use freq by resynthesizing
    left = np.zeros(n)
    right = np.zeros(n)
    for i in range(voices):
        d = (i - (voices - 1) / 2) / max(1, (voices - 1) / 2)
        cents = d * 10
        p = phase_of(fr * 2 ** (cents / 1200), n, i * 0.41)
        v = saw(p)
        left += v * (0.6 + 0.4 * (1 - d))
        right += v * (0.6 + 0.4 * (1 + d))
    left /= voices
    right /= voices
    env = adsr(n, a=0.01, d=0.12, s=0.72, r=0.28)
    body = np.stack([lp(left, 2600 + 2600 * bright), lp(right, 2600 + 2600 * bright)], axis=1)
    body = body * env[:, None]
    # gentle saturation
    body = np.tanh(body * 1.5) * 0.62
    return body * gain


def pluck(midi, dur=0.25, gain=1.0, bright=1.0, pan=0.0):
    n = int((dur + 0.25) * SR)
    t = tt(n)
    f = hz(midi)
    p1 = phase_of(f, n)
    p2 = phase_of(f * 2.003, n, 0.5)
    sig = saw(p1) * 0.55 + tri(p2) * 0.3 + sine(p1) * 0.35
    cutoff = 700 + 5200 * bright
    sig = lp(sig, cutoff)
    sig *= adsr(n, a=0.002, d=0.14, s=0.0, r=0.16, curve=2.4)
    sig *= exp_env(n, 3.0)
    return pan2(sig * 0.55 * gain, pan)


def bell(midi, dur=1.6, gain=1.0):
    n = int(dur * SR)
    t = tt(n)
    f = hz(midi)
    sig = np.sin(2 * np.pi * f * t) * np.exp(-t * 1.8)
    sig += np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 4.0) * 0.28
    sig += np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 7.0) * 0.12
    sig *= np.clip(t / 0.004, 0, 1)
    return sig * 0.30 * gain


def pad_chord(midis, dur, gain=1.0, cutoff=1500, attack=0.6, release=1.2, width=1.0):
    n = int((dur + release) * SR)
    left = np.zeros(n)
    right = np.zeros(n)
    for j, m in enumerate(midis):
        for i in range(3):
            d = (i - 1) * 0.12
            f = hz(m) * 2 ** (d * 7 / 1200)
            p = phase_of(f, n, j * 0.21 + i * 0.33)
            v = saw(p)
            left += v * (0.5 + 0.2 * (1 - d))
            right += v * (0.5 + 0.2 * (1 + d))
    left /= len(midis) * 3
    right /= len(midis) * 3
    left = lp(left, cutoff)
    right = lp(right, cutoff)
    env = adsr(n, a=attack, d=0.5, s=0.78, r=release, curve=1.4)
    return np.stack([left * env, right * env], axis=1) * gain


def bass_note(midi, dur, gain=1.0, drive=1.0, bright=1.0):
    n = int((dur + 0.12) * SR)
    t = tt(n)
    f = hz(midi)
    p = phase_of(f, n)
    sig = saw(p) * 0.55 + square(p * 0.5) * 0.35 + sine(p) * 0.55
    sig = lp(sig, 260 + 900 * bright)
    env = adsr(n, a=0.006, d=0.06, s=0.72, r=0.08)
    sig *= env
    sig = np.tanh(sig * (1.4 * drive)) * 0.62
    return sig * gain


def sub_note(midi, dur, gain=1.0):
    n = int((dur + 0.15) * SR)
    t = tt(n)
    sig = np.sin(2 * np.pi * hz(midi) * t)
    env = adsr(n, a=0.005, d=0.08, s=0.85, r=0.12)
    return sig * env * gain


def riser(dur, gain=1.0, f0=300, f1=9000):
    n = int(dur * SR)
    t = tt(n)
    noise = rng.normal(0, 1, n)
    # crude sweep: crossfade a few bandpassed copies
    segs = []
    for i in range(8):
        c = f0 * (f1 / f0) ** (i / 7)
        segs.append(bp(noise, c * 0.6, min(c * 1.6, SR * 0.45)))
    idx = np.clip((np.linspace(0, 7, n)).astype(int), 0, 7)
    swept = np.choose(idx, segs)
    amp = np.linspace(0.02, 1.0, n) ** 2.2
    tone = saw(phase_of(np.linspace(120, 800, n), n)) * 0.12
    sig = (swept * 0.5 + tone) * amp
    sig = hp(sig, 300)
    return sig * 0.5 * gain


def reverse_cymbal(dur=1.2, gain=1.0):
    n = int(dur * SR)
    t = tt(n)
    sig = hp(rng.normal(0, 1, n), 3000)
    env = (t / dur) ** 3.0
    return sig * env * 0.6 * gain


def vinyl():
    n = int(1.0 * SR)
    return hp(rng.normal(0, 1, n), 4000) * 0.012


# ----------------------------------------------------------------------------
# effects
# ----------------------------------------------------------------------------
def make_ir(length=1.7, decay=2.6, bright=0.55):
    n = int(length * SR)
    t = tt(n)
    ir = rng.normal(0, 1, (n, 2))
    ir *= np.exp(-t * decay)[:, None]
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    ir[:, 0] = lp(ir[:, 0], 7000 * bright + 1200)
    ir[:, 1] = lp(ir[:, 1], 7000 * bright + 1200)
    ir /= np.sqrt(np.sum(ir ** 2) / 2)
    return ir


def convolve_reverb(mix, send, wet=0.3, length=1.7):
    ir = make_ir(length)
    wetbuf = np.stack(
        [
            signal.fftconvolve(send[:, 0], ir[:, 0])[: len(mix)],
            signal.fftconvolve(send[:, 1], ir[:, 1])[: len(mix)],
        ],
        axis=1,
    )
    return mix + wetbuf * wet


def delay_fx(mix, send, time=0.28, feedback=0.38, wet=0.22, pingpong=True):
    n = len(mix)
    d = int(time * SR)
    out = np.zeros_like(send)
    src = send.copy()
    taps = 5
    for k in range(taps):
        g = feedback ** k
        sh = d * (k + 1)
        if sh >= n:
            break
        if pingpong:
            if k % 2 == 0:
                out[sh:, 0] += src[: n - sh, 0] * g
                out[sh:, 1] += src[: n - sh, 1] * g * 0.7
            else:
                out[sh:, 0] += src[: n - sh, 1] * g * 0.7
                out[sh:, 1] += src[: n - sh, 0] * g
        else:
            out[sh:] += src[: n - sh] * g
    return mix + out * wet


def sidechain_env(kick_times, n, depth=0.62, release=0.16):
    env = np.ones(n)
    for kt in kick_times:
        s = int(kt * SR)
        if s >= n:
            continue
        ln = min(int(0.45 * SR), n - s)
        if ln <= 0:
            continue
        x = np.arange(ln) / SR
        duck = 1 - depth * np.exp(-x / release)
        # quick attack
        att = int(0.012 * SR)
        if att < ln:
            duck[:att] = 1 - depth * (np.arange(att) / att) ** 0.5
        env[s:s + ln] = np.minimum(env[s:s + ln], duck)
    return env


def compressor(x, threshold=0.32, ratio=3.0, attack=0.01, release=0.18):
    # simple envelope-follower compressor, vectorized-ish in blocks
    env = np.abs(x).max(axis=1)
    # smooth envelope with one-pole implemented via lfilter
    a = math.exp(-1 / (release * SR))
    b = 1 - a

    def smooth(v, coeff):
        # fast attack / slow release via maximum trick approximated
        out = np.empty_like(v)
        acc = 0.0
        # block processing at 1/8 SR for speed then interpolate
        hop = 16
        n = len(v)
        m = (n + hop - 1) // hop
        blocks = np.zeros(m)
        for i in range(m):
            seg = v[i * hop:(i + 1) * hop]
            if len(seg):
                blocks[i] = seg.max()
        sm = np.empty(m)
        acc = 0.0
        for i in range(m):
            target = blocks[i]
            coeff_ = 0.55 if target > acc else 0.12
            acc = acc + (target - acc) * coeff_
            sm[i] = acc
        out = np.repeat(sm, hop)[:n]
        return out

    e = smooth(env, a)
    gain = np.ones_like(e)
    over = e > threshold
    gain[over] = (threshold / np.maximum(e[over], 1e-9)) ** (1 - 1 / ratio)
    # smooth gain
    g = np.empty_like(gain)
    acc = 1.0
    for i in range(0, len(gain), 8):
        seg = gain[i:i + 8]
        target = seg.mean()
        acc += (target - acc) * 0.25
        g[i:i + 8] = acc
    return x * g[:, None]


# ----------------------------------------------------------------------------
# mix / mastering helpers
# ----------------------------------------------------------------------------
def _st(x):
    """run a 1D-oriented filter over a stereo (n,2) buffer"""
    return x.T if x.ndim == 2 else x


def band(x, lo, hi, order=2):
    return bp(_st(x), lo, hi, order).T if x.ndim == 2 else bp(x, lo, hi, order)


def eq_band(x, lo, hi, db, order=2):
    """crude peaking band: add a filtered copy scaled to +db"""
    g = 10 ** (db / 20.0) - 1.0
    if abs(g) < 1e-4:
        return x
    return x + band(x, lo, hi, order) * g


def mono_bass(x, f=110.0):
    """keep everything below f centred so the low end stays solid on phones"""
    low = lp(_st(x), f).T
    return (x - low) + low.mean(axis=1)[:, None]


def saturate(x, drive=1.4, wet=0.3, f=120.0):
    """tape-ish drive on the mid/high band only, leave the sub clean"""
    low = lp(_st(x), f).T
    high = x - low
    sat = np.tanh(high * drive) / np.tanh(drive)
    return low + high * (1.0 - wet) + sat * wet


def limiter(x, ceiling=0.93, attack_ms=2.0, release_ms=150.0):
    env = np.abs(x).max(axis=1)
    a = max(2, int(SR * attack_ms / 1000.0))
    peak = maximum_filter1d(env, a, mode="nearest")
    need = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    g = uniform_filter1d(need, max(2, int(SR * release_ms / 1000.0)), mode="nearest")
    g = np.minimum(g, need)
    y = x * g[:, None]
    over = np.abs(y) > ceiling
    if over.any():
        y = np.where(over, np.sign(y) * (ceiling - (ceiling * 0.02) * np.exp(-(np.abs(y) - ceiling) * 12)), y)
    return y


def master(mix, mud=-1.2, presence=0.8, air=1.4, drive=1.4, wet=0.28,
           thr=0.30, ratio=2.6, ceiling=0.93, low_cut=26.0, target_rms=0.26):
    """shared bus: clean sub, de-mud, presence, air, drive, comp, limiter.

    Everything is normalised to the ceiling twice (before and after the
    compressor) so that every track lands at a comparable loudness instead of
    inheriting whatever headroom its arrangement happened to leave.
    """
    mix = hp(_st(mix), low_cut).T
    mix = mono_bass(mix, 110.0)
    mix = eq_band(mix, 190, 430, mud)
    mix = eq_band(mix, 2600, 5200, presence)
    mix = eq_band(mix, 10500, 16500, air)
    mix = saturate(mix, drive, wet, 125.0)
    mix *= ceiling / max(float(np.abs(mix).max()), 1e-9)
    mix = compressor(mix, threshold=thr, ratio=ratio)
    # loudness match: every track gets the same integrated RMS, then the limiter
    # only has to catch the transients that poke above the ceiling
    rms = float(np.sqrt(np.mean(mix ** 2)))
    mix *= target_rms / max(rms, 1e-9)
    return limiter(mix, ceiling, attack_ms=4.0, release_ms=180.0)


def human(t, amt=0.006):
    """small timing jitter, keeps loops from sounding machine-locked"""
    return t + float(rng.uniform(-amt, amt))


def hum_vel(base, amt=0.12):
    return base * (1.0 + float(rng.uniform(-amt, amt)))


# ----------------------------------------------------------------------------
# composition helpers
# ----------------------------------------------------------------------------
MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]


def chord_notes(root_pc, quality, octave=4):
    """root_pc absolute midi already? here root is midi note."""
    if quality == "min":
        ints = [0, 3, 7, 10, 14]
    elif quality == "maj":
        ints = [0, 4, 7, 11, 14]
    elif quality == "min9":
        ints = [0, 3, 7, 10, 14]
    elif quality == "maj7":
        ints = [0, 4, 7, 11, 14]
    elif quality == "maj9":
        ints = [0, 4, 7, 11, 14]
    elif quality == "sus2":
        ints = [0, 2, 7, 12, 14]
    else:
        ints = [0, 4, 7]
    return [root_pc + i for i in ints]


# ----------------------------------------------------------------------------
# extra instruments — tracks 3-5
# ----------------------------------------------------------------------------
def kick_hard(length=0.40):
    n = int(length * SR)
    t = tt(n)
    f = 46 + 210 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.4)
    click = hp(rng.normal(0, 1, n), 1400) * np.exp(-t * 210) * 0.30
    sig = np.tanh((body + click) * 3.1)
    return sig * adsr(n, 0.0008, 0.02, 0.9, 0.05) * 0.95


def kick_lofi(length=0.60):
    n = int(length * SR)
    t = tt(n)
    f = 48 + 92 * np.exp(-t * 24)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5.0)
    sub = np.sin(2 * np.pi * 44 * t) * np.exp(-t * 6.5) * 0.55
    click = lp(rng.normal(0, 1, n), 1100) * np.exp(-t * 130) * 0.22
    return lp(body + sub + click, 2600) * adsr(n, 0.002, 0.04, 0.92, 0.1) * 0.95


def snare_hard(length=0.28):
    n = int(length * SR)
    t = tt(n)
    tone = np.sin(2 * np.pi * 186 * t) * np.exp(-t * 30) * 0.55
    tone += np.sin(2 * np.pi * 320 * t) * np.exp(-t * 40) * 0.20
    noise = bp(rng.normal(0, 1, n), 800, 9800) * np.exp(-t * 14)
    return np.tanh((tone + noise) * 1.7) * 0.8


def snare_brush(length=0.30):
    n = int(length * SR)
    t = tt(n)
    noise = bp(rng.normal(0, 1, n), 1200, 10500) * np.exp(-t * 22) * 0.42
    tone = np.sin(2 * np.pi * 176 * t) * np.exp(-t * 36) * 0.35
    return (noise + tone) * 0.85


def rhodes(midi, dur=1.6, gain=1.0):
    """warm electric-piano-ish tone, mono."""
    n = int((dur + 0.8) * SR)
    t = tt(n)
    f = hz(midi)
    sig = np.zeros(n)
    for k, amp, dec in ((1.0, 1.0, 2.2), (2.01, 0.40, 3.6), (3.98, 0.18, 5.4), (6.2, 0.06, 8.0)):
        sig += amp * np.sin(2 * np.pi * f * k * t) * np.exp(-t * dec)
    trem = 1.0 + 0.06 * np.sin(2 * np.pi * 4.3 * t)
    env = adsr(n, 0.006, 0.02, 0.25, 0.5, 1.8)
    return sig * env * trem * 0.30 * gain


def glass(midi, dur=2.2, gain=1.0):
    """cold FM-ish bell for ambient passages, mono."""
    n = int((dur + 0.6) * SR)
    t = tt(n)
    f = hz(midi)
    sig = np.sin(2 * np.pi * f * t) * np.exp(-t * 1.3)
    sig += np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 2.8) * 0.32
    sig += np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 4.6) * 0.13
    sig += np.sin(2 * np.pi * f * 8.9 * t) * np.exp(-t * 7.0) * 0.05
    sig *= np.clip(t / 0.006, 0, 1)
    return sig * 0.34 * gain


def acid_note(midi, dur, gain=1.0, cut=1400):
    n = int((dur + 0.06) * SR)
    f = hz(midi)
    sig = saw(phase_of(f, n)) * 0.62 + square(phase_of(f * 2, n)) * 0.16
    sig = bp(sig, 180, cut)
    sig = np.tanh(sig * 2.6)
    env = adsr(n, 0.003, 0.07, 0.55, 0.05)
    return sig * env * 0.5 * gain


def hoover_stab(midis, dur, gain=1.0, bright=1.0):
    """detuned rave stab, stereo."""
    n = int((dur + 0.2) * SR)
    out = np.zeros((n, 2))
    for m in midis:
        out += supersaw(hz(m), n, detune=0.14, voices=7)
    out /= max(1, len(midis))
    c = 900 + 4200 * bright
    out = np.stack([lp(out[:, 0], c), lp(out[:, 1], c)], axis=1)
    env = adsr(n, 0.005, 0.08, 0.6, 0.18, 1.6)
    return out * env[:, None] * 0.5 * gain


def muted_lead(midi, dur, gain=1.0):
    x = lead_note(midi, dur, bright=0.25, gain=1.0, vib=0.012, voices=3)
    x = np.stack([lp(x[:, 0], 1900), lp(x[:, 1], 1900)], axis=1)
    return x * gain


# ----------------------------------------------------------------------------
# Track 1 — NEON PULSE (176 BPM, A minor, drum & bass)
# ----------------------------------------------------------------------------
def build_neon_pulse():
    bpm, bars, seconds = 176, 66, 90.0
    b = 60 / bpm
    bar = b * 4
    mx = Mixer(seconds)

    # --- harmony: 2 bars per chord, 8-bar cycle
    prog = [
        (45, "min9"),   # Am9  (A2 root)
        (41, "maj7"),   # Fmaj7
        (48, "maj7"),   # Cmaj7
        (43, "sus2"),   # G6/sus2
    ]
    # bass roots one octave lower
    bass_roots = [33, 29, 36, 31]

    def chord_at(bar_i):
        return prog[(bar_i // 2) % 4]

    # kick times for sidechain
    kick_times = []
    for bar_i in range(6, 60):
        if 32 <= bar_i < 40:
            kick_times.append(bar_i * bar + 0 * b)
            kick_times.append(bar_i * bar + 2 * b)
        elif bar_i < 16:
            for q in range(4):
                kick_times.append(bar_i * bar + q * b)
        else:
            kick_times.append(bar_i * bar + 0 * b)
            kick_times.append(bar_i * bar + 2.5 * b)
            kick_times.append(bar_i * bar + 3.25 * b)
    sc = sidechain_env(kick_times, mx.n, depth=0.58, release=0.14)

    # --- pads throughout
    for bar_i in range(0, 66):
        root, qual = chord_at(bar_i)
        notes = chord_notes(root + 12, qual)
        if bar_i < 6:
            g = 0.16 + 0.02 * bar_i
            bright = 700 + 90 * bar_i
        elif 32 <= bar_i < 40:
            g = 0.16
            bright = 1200
        elif bar_i >= 60:
            g = max(0.0, 0.16 * (1 - (bar_i - 60) / 6))
            bright = 700
        else:
            g = 0.12
            bright = 1500
        dur = bar * 2 if bar_i % 2 == 0 else bar
        if bar_i % 2 == 0:
            mx.add("pad", bar_i * bar, pad_chord(notes, dur, gain=g, cutoff=bright,
                                                 attack=0.5 if bar_i > 6 else 1.6,
                                                 release=1.0), pan=0)
    # --- filtered arp / sparkle
    arp_pat = [0, 2, 4, 2, 1, 3, 4, 3]
    for bar_i in range(2, 66):
        if bar_i >= 60 and bar_i % 2 == 1:
            continue
        root, qual = chord_at(bar_i)
        notes = chord_notes(root + 24, qual)
        if 32 <= bar_i < 40:
            gain = 0.05
        elif bar_i < 6:
            gain = 0.02 + 0.006 * bar_i
        elif bar_i >= 60:
            gain = 0.05 * max(0, 1 - (bar_i - 60) / 6)
        else:
            gain = 0.065
        for step in range(16):
            if bar_i < 6 and step % 4 != 0:
                continue
            idx = arp_pat[step % 8]
            midi = notes[idx % len(notes)] + (12 if step % 8 >= 5 and bar_i >= 16 else 0)
            t = bar_i * bar + step * (b / 4)
            p = math.sin(step * 0.7 + bar_i) * 0.6
            mx.add("arp", t, pluck(midi, 0.16, gain=gain, bright=0.7, pan=p), pan=0)
            mx.add("arp2", t, bell(midi + 12, 0.6, gain=gain * 0.25))
    # --- drums
    for bar_i in range(6, 60):
        t0 = bar_i * bar
        # intro / builds
        if bar_i < 16:
            if bar_i < 10:
                for q in range(4):
                    mx.add("kick", t0 + q * b, kick("soft"), 0.5 if q else 0.65)
            else:
                for q in range(4):
                    mx.add("kick", t0 + q * b, kick(), 0.72)
                if bar_i >= 12:
                    mx.add("clap", t0 + b, clap(), 0.32)
                    mx.add("clap", t0 + 3 * b, clap(), 0.32)
            if bar_i >= 8:
                for s in range(0, 16, 2):
                    mx.add("hat", t0 + s * b / 4, hat(open_=(s % 8 == 6)), 0.20)
            if bar_i >= 14:
                # snare roll
                roll = 8 if bar_i == 14 else 16
                for s in range(roll):
                    mx.add("snare", t0 + s * (4 * b / roll), snare(), 0.12 + 0.18 * s / roll)
                mx.add("riser", t0, riser(bar, 0.5), 0.7)
            continue
        # break
        if 32 <= bar_i < 40:
            mx.add("kick", t0, kick("soft"), 0.65)
            mx.add("kick", t0 + 2 * b, kick("soft"), 0.5)
            mx.add("snare", t0 + 2 * b, snare("big"), 0.45)
            for s in range(0, 16, 2):
                mx.add("hat", t0 + s * b / 4, hat(), 0.14)
            if bar_i >= 36:
                mx.add("riser", t0, riser(bar, 0.65), 0.9)
                if bar_i >= 38:
                    for s in range(16):
                        mx.add("snare", t0 + s * b / 4, snare(), 0.08 + 0.012 * s)
            continue
        # drops
        mx.add("kick", t0, kick(), 0.9)
        mx.add("kick", t0 + 2.5 * b, kick(), 0.62)
        if bar_i % 4 != 3:
            mx.add("kick", t0 + 3.25 * b, kick(), 0.45)
        mx.add("snare", t0 + b, snare("big"), 0.55)
        mx.add("snare", t0 + 3 * b, snare("big"), 0.55)
        if bar_i % 4 == 3:
            mx.add("snare", t0 + 3.5 * b, snare(), 0.24)
            mx.add("snare", t0 + 3.75 * b, snare(), 0.3)
        for s in range(16):
            if s % 4 == 2:
                mx.add("hat", t0 + s * b / 4, hat(open_=True), 0.12)
            else:
                mx.add("hat", t0 + s * b / 4, hat(), 0.13 if s % 2 == 0 else 0.07)
        if bar_i % 8 == 0:
            mx.add("crash", t0, crash(), 0.5)
            mx.add("impact", t0, impact(), 0.45)
    # final hits
    for hit_bar in (16, 24, 32, 40, 48, 56, 60):
        mx.add("impact", hit_bar * bar, impact(2.2), 0.55)
        mx.add("crash", hit_bar * bar, crash(1.6), 0.35)

    # --- bass
    for bar_i in range(6, 60):
        if 32 <= bar_i < 40:
            continue
        t0 = bar_i * bar
        root = bass_roots[(bar_i // 4) % 4]
        if bar_i < 16:
            for q in range(4):
                mx.add("bass", t0 + q * b, bass_note(root, b * 0.8, 0.5), 1)
            mx.add("sub", t0, sub_note(root - 12, bar * 0.95, 0.3), 1)
            continue
        # dnb bass: long root + offbeat octave stabs
        mx.add("sub", t0, sub_note(root - 12, bar * 0.95, 0.42), 1)
        mx.add("bass", t0, bass_note(root, b * 0.9, 0.55, bright=0.9), 1)
        mx.add("bass", t0 + 1.5 * b, bass_note(root, b * 0.3, 0.45, bright=0.6), 1)
        mx.add("bass", t0 + 2.5 * b, bass_note(root + 12, b * 0.22, 0.35, bright=1.2), 1)
        mx.add("bass", t0 + 3 * b, bass_note(root + 7, b * 0.4, 0.4, bright=0.8), 1)
        if bar_i % 4 == 3:
            mx.add("bass", t0 + 3.5 * b, bass_note(root + 12, b * 0.18, 0.3, bright=1.2), 1)
            mx.add("bass", t0 + 3.75 * b, bass_note(root + 10, b * 0.18, 0.3, bright=1.2), 1)
    # break bass: sustained
    for bar_i in range(32, 40):
        root = bass_roots[(bar_i // 2) % 4]
        mx.add("sub", bar_i * bar, sub_note(root - 12, bar * 0.9, 0.28), 1)

    # --- lead melody
    # (bar offset, beat offset, midi, dur in beats)
    phrase = [
        (0, 81, 0.45), (0.5, 76, 0.45), (1, 79, 0.45), (1.5, 76, 0.45),
        (2, 74, 0.45), (2.5, 72, 0.45), (3, 74, 0.45), (3.5, 76, 0.45),
        (4, 72, 0.9), (5, 76, 0.45), (5.5, 79, 0.45), (6, 81, 0.9),
        (7, 83, 0.45), (7.5, 81, 0.45),
    ]
    phrase_b = [
        (0, 76, 0.45), (0.5, 74, 0.45), (1, 72, 0.45), (1.5, 69, 0.45),
        (2, 72, 0.45), (2.5, 74, 0.45), (3, 76, 0.9),
        (4, 79, 0.45), (4.5, 81, 0.45), (5, 83, 0.9),
        (6, 81, 0.45), (6.5, 79, 0.45), (7, 76, 0.9),
    ]
    for cycle in range(2):
        base_bar = 16 + cycle * 8
        mel = phrase if cycle == 0 else phrase_b
        for (off, midi, dur) in mel:
            mx.add("lead", (base_bar + off // 4) * bar + (off % 4) * b,
                   lead_note(midi, dur * b, bright=1.0, gain=0.5, vib=0.002),
                   pan=0)
    # second drop: octave / harmony
    for cycle in range(2):
        base_bar = 40 + cycle * 8
        mel = phrase if cycle % 2 == 0 else phrase_b
        for (off, midi, dur) in mel:
            t = (base_bar + off // 4) * bar + (off % 4) * b
            mx.add("lead", t, lead_note(midi + (12 if cycle == 1 else 0), dur * b,
                                        bright=1.15, gain=0.46, vib=0.0025), pan=0)
            if cycle == 1:
                mx.add("lead2", t, lead_note(midi + 7, dur * b, bright=0.9,
                                             gain=0.18, vib=0.002), pan=0.4)
    # break lead — airy bell melody
    break_mel = [(0, 69, 4), (1, 72, 4), (2, 76, 4), (3, 74, 4),
                 (4, 72, 4), (5, 76, 4), (6, 81, 8)]
    for off, midi, d in break_mel:
        t = (32 + off) * bar
        mx.add("bell", t, bell(midi + 12, 2.0, gain=0.35))
        mx.add("pad_lead", t, lead_note(midi, d * b * 0.9, bright=0.55, gain=0.22,
                                        vib=0.004, voices=3))
    # finale sustained lead
    for k, midi in enumerate((81, 84, 83, 81)):
        mx.add("lead", (56 + k) * bar, lead_note(midi, bar * 0.9, bright=1.0,
                                                 gain=0.42, vib=0.003), pan=0)
    # intro texture
    for k in range(10):
        mx.add("fx", k * 0.9, bell(93 + (k % 3) * 3, 1.6, gain=0.10))
    mx.add("fx", 6 * bar - 4.0, reverse_cymbal(4.0, 0.5), 0.7)
    mx.add("fx", 14 * bar, riser(bar * 2, 0.8), 0.8)
    mx.add("fx", 38 * bar, riser(bar * 2, 0.9), 0.9)
    mx.add("fx", 58 * bar, reverse_cymbal(3.0, 0.4), 0.8)
    mx.add("fx", 59.5 * bar, impact(3.0), 0.6)

    # --- mix
    for stem in ("kick", "snare", "hat", "clap", "crash"):
        pass
    # sidechain bass/pad/arp after they are rendered
    sc_full = np.ones(mx.n + SR * 3)
    sc_full[: mx.n] = sc
    for stem in ("bass", "pad", "arp"):
        mx.bus[stem] *= sc_full[:, None]
    # audible balance
    gains = {
        "kick": 0.95, "snare": 0.72, "hat": 0.5, "clap": 0.55, "crash": 0.5,
        "bass": 0.72, "sub": 0.6, "pad": 0.62, "arp": 0.55, "arp2": 0.5,
        "lead": 0.8, "lead2": 0.5, "bell": 0.7, "pad_lead": 0.6, "fx": 0.6,
        "impact": 0.7,
    }
    mix = np.zeros((mx.n, 2))
    for stem, buf in mx.bus.items():
        if stem == "send":
            continue
        mix += buf[: mx.n] * gains.get(stem, 0.5)
    # sends
    send = np.zeros_like(mix)
    for stem, amt in (("snare", 0.20), ("lead", 0.28), ("arp", 0.30), ("arp2", 0.3),
                      ("bell", 0.4), ("pad", 0.16), ("impact", 0.25), ("clap", 0.2)):
        if stem in mx.bus:
            send += mx.bus[stem][: mx.n] * amt
    mix = convolve_reverb(mix, send, wet=0.55, length=1.9)
    ds = np.zeros_like(mix)
    if "lead" in mx.bus:
        ds += mx.bus["lead"][: mx.n] * 0.4
    if "arp" in mx.bus:
        ds += mx.bus["arp"][: mx.n] * 0.5
    mix = delay_fx(mix, ds, time=0.5, feedback=0.42, wet=0.28)
    # master
    mix = master(mix, mud=-1.3, presence=1.0, air=1.6, drive=1.75, wet=0.45,
                 thr=0.32, ratio=2.8, low_cut=24.0, target_rms=0.285)
    # exact length
    out = np.zeros((int(seconds * SR), 2))
    k = min(len(out), len(mix))
    out[:k] = mix[:k]
    # fade tail
    fade = int(1.2 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out, {
        "id": "neon-pulse", "bpm": bpm, "bars": bars, "duration": seconds,
        "sections": [
            {"name": "intro", "startBar": 0, "endBar": 6},
            {"name": "build", "startBar": 6, "endBar": 16},
            {"name": "drop1", "startBar": 16, "endBar": 32},
            {"name": "break", "startBar": 32, "endBar": 40},
            {"name": "drop2", "startBar": 40, "endBar": 56},
            {"name": "outro", "startBar": 56, "endBar": 66},
        ],
        "impacts": [16, 24, 32, 40, 48, 56, 60],
    }


# ----------------------------------------------------------------------------
# Track 2 — FROSTLIGHT (144 BPM, D minor, melodic future bass)
# ----------------------------------------------------------------------------
def build_frostlight():
    bpm, bars, seconds = 144, 54, 90.0
    b = 60 / bpm
    bar = b * 4
    mx = Mixer(seconds)

    prog = [
        (50, "min9"),   # Dm9 (D3)
        (46, "maj7"),   # Bbmaj7
        (53, "maj9"),   # Fmaj9
        (48, "sus2"),   # Csus2
    ]
    bass_roots = [38, 34, 41, 36]  # D2, Bb1, F2, C2

    def chord_at(bar_i):
        return prog[(bar_i // 2) % 4]

    kick_times = []
    for bar_i in range(4, 54):
        if 16 <= bar_i < 30 or 38 <= bar_i < 50:
            kick_times.append(bar_i * bar)
            kick_times.append(bar_i * bar + 2.5 * b)
        elif 8 <= bar_i < 16:
            for q in range(4):
                kick_times.append(bar_i * bar + q * b)
        else:
            kick_times.append(bar_i * bar)
            kick_times.append(bar_i * bar + 2 * b)
    sc = sidechain_env(kick_times, mx.n, depth=0.52, release=0.20)

    # pads
    for bar_i in range(0, 54):
        root, qual = chord_at(bar_i)
        notes = chord_notes(root + 12, qual)
        if bar_i < 8:
            g = 0.10 + 0.012 * bar_i
            bright = 600 + 100 * bar_i
        elif bar_i >= 50:
            g = 0.13 * (1 - (bar_i - 50) / 4)
            bright = 800
        else:
            g = 0.11
            bright = 1800
        if bar_i % 2 == 0:
            mx.add("pad", bar_i * bar, pad_chord(notes, bar * 2, gain=g, cutoff=bright,
                                                 attack=0.6, release=1.3), pan=0)
    # music box / bell arp
    arp_pat = [0, 2, 4, 3, 1, 4, 2, 3]
    for bar_i in range(3, 54):
        if bar_i >= 50 and bar_i % 2 == 1:
            continue
        root, qual = chord_at(bar_i)
        notes = chord_notes(root + 24, qual)
        if bar_i < 8:
            gain = 0.02 + 0.005 * (bar_i - 3)
        elif 30 <= bar_i < 38:
            gain = 0.06
        elif bar_i >= 50:
            gain = 0.04 * (1 - (bar_i - 50) / 5)
        else:
            gain = 0.055
        for step in range(16):
            if bar_i < 8 and step % 2 == 1:
                continue
            idx = arp_pat[(step + bar_i) % 8]
            midi = notes[idx % len(notes)]
            t = bar_i * bar + step * b / 4
            pan = math.sin(step * 0.6) * 0.55
            mx.add("bell", t, bell(midi + 12, 1.4, gain=gain * 0.6))
            mx.add("pluck", t, pluck(midi, 0.2, gain=gain, bright=0.8, pan=pan), pan=0)
    # drums
    for bar_i in range(4, 50):
        t0 = bar_i * bar
        if bar_i < 8:
            for q in range(4):
                mx.add("kick", t0 + q * b, kick("soft"), 0.28)
            for s in range(0, 16, 4):
                mx.add("hat", t0 + s * b / 4, hat(), 0.10)
            continue
        if 8 <= bar_i < 16:
            for q in range(4):
                mx.add("kick", t0 + q * b, kick(), 0.65)
            mx.add("clap", t0 + b, clap(), 0.34)
            mx.add("clap", t0 + 3 * b, clap(), 0.34)
            for s in range(0, 16, 2):
                mx.add("hat", t0 + s * b / 4, hat(open_=(s % 8 == 6)), 0.15)
            if bar_i >= 14:
                mx.add("riser", t0, riser(bar, 0.65), 0.8)
                for s in range(16):
                    mx.add("snare", t0 + s * b / 4, snare(), 0.06 + 0.012 * s)
            continue
        if 30 <= bar_i < 38:
            # break / build
            if bar_i < 34:
                mx.add("kick", t0, kick("soft"), 0.4)
                mx.add("snare", t0 + 2 * b, snare("big"), 0.3)
            else:
                for q in range(4):
                    mx.add("kick", t0 + q * b, kick("soft"), 0.35 + 0.05 * (bar_i - 34))
                for s in range(16):
                    mx.add("snare", t0 + s * b / 4, snare(), 0.05 + 0.015 * (bar_i - 34))
                mx.add("riser", t0, riser(bar, 0.7), 0.85)
            for s in range(0, 16, 4):
                mx.add("hat", t0 + s * b / 4, hat(), 0.08)
            continue
        # drop: half-time future bass
        mx.add("kick", t0, kick("soft"), 0.85)
        mx.add("kick", t0 + 2.5 * b, kick("soft"), 0.6)
        mx.add("snare", t0 + 2 * b, snare("big"), 0.72)
        mx.add("clap", t0 + 2 * b, clap(), 0.42)
        if bar_i % 4 == 3:
            mx.add("snare", t0 + 3.5 * b, snare(), 0.2)
            mx.add("snare", t0 + 3.75 * b, snare(), 0.26)
        for s in range(16):
            if s % 4 == 2:
                mx.add("hat", t0 + s * b / 4, hat(open_=True), 0.10)
            else:
                mx.add("hat", t0 + s * b / 4, hat(), 0.09 if s % 2 == 0 else 0.05)
        if bar_i % 8 == 0:
            mx.add("crash", t0, crash(), 0.45)
            mx.add("impact", t0, impact(), 0.4)
    for hit_bar in (16, 30, 38, 46):
        mx.add("impact", hit_bar * bar, impact(2.2), 0.5)
    # bass
    for bar_i in range(4, 54):
        root = bass_roots[(bar_i // 4) % 4]
        t0 = bar_i * bar
        if bar_i < 8:
            mx.add("sub", t0, sub_note(root - 12, bar * 0.9, 0.22), 1)
            continue
        if 30 <= bar_i < 38:
            mx.add("sub", t0, sub_note(root - 12, bar * 0.9, 0.28), 1)
            continue
        if bar_i >= 50:
            mx.add("sub", t0, sub_note(root - 12, bar * 0.9, 0.18), 1)
            continue
        mx.add("sub", t0, sub_note(root - 12, bar * 0.9, 0.5), 1)
        mx.add("bass", t0, bass_note(root, bar * 0.45, 0.5, bright=0.7), 1)
        mx.add("bass", t0 + 2 * b, bass_note(root, b * 0.8, 0.38, bright=0.6), 1)
        if bar_i % 4 == 3:
            mx.add("bass", t0 + 3.5 * b, bass_note(root + 12, b * 0.3, 0.3, bright=1.0), 1)
    # supersaw chord stabs in drop
    for bar_i in range(16, 50):
        if 30 <= bar_i < 38:
            continue
        root, qual = chord_at(bar_i)
        notes = chord_notes(root + 12, qual)
        for beat in (0.5, 1.5, 2.75, 3.5):
            t = bar_i * bar + beat * b
            dur = b * 0.32
            for m in notes:
                mx.add("stab", t, pad_chord([m, m + 12], dur, gain=0.09, cutoff=2400,
                                            attack=0.005, release=0.18), pan=0)
    # lead melody
    mel_a = [
        (0, 74, 1.4), (1.5, 77, 0.5), (2, 81, 1.0), (3, 79, 0.5), (3.5, 77, 0.5),
        (4, 76, 1.4), (5.5, 74, 0.5), (6, 72, 1.6),
        (8, 74, 0.8), (9, 77, 0.8), (10, 81, 1.2), (11.5, 84, 0.5),
        (12, 81, 1.6), (14, 79, 1.2), (15, 77, 1.0),
    ]
    mel_b = [
        (0, 81, 1.2), (1.5, 84, 0.6), (2, 86, 1.2), (3.5, 84, 0.6),
        (4, 81, 1.4), (5.5, 79, 0.6), (6, 77, 1.6),
        (8, 79, 0.8), (9, 81, 0.8), (10, 84, 1.4), (11.5, 86, 0.6),
        (12, 84, 1.4), (13.5, 81, 0.6), (14, 77, 1.6),
    ]
    for bar_i in (16, 24, 38, 46):
        mel = mel_a if bar_i % 16 == 0 else mel_b
        for off, midi, dur_beats in mel:
            t = bar_i * bar + off * b
            mx.add("lead", t, lead_note(midi, dur_beats * b, bright=0.8, gain=0.38,
                                        vib=0.0035, voices=5), pan=0)
            mx.add("lead_harm", t, lead_note(midi - 12, dur_beats * b, bright=0.5,
                                             gain=0.12, vib=0.002, voices=3), pan=-0.3)
    # break melody (piano-ish)
    break_mel = [
        (30, 0, 74, 1.5), (30, 2, 77, 1.0), (30, 3.5, 81, 0.5),
        (31, 0, 79, 1.0), (31, 1.5, 77, 1.0), (31, 3, 74, 1.0),
        (32, 0, 72, 1.5), (32, 2, 74, 1.0), (32, 3.5, 76, 0.5),
        (33, 0, 77, 1.5), (33, 2, 79, 0.5), (33, 2.5, 77, 0.5), (33, 3.5, 74, 0.5),
        (34, 0, 76, 1.5), (34, 2, 79, 1.0), (34, 3.5, 81, 0.5),
        (35, 0, 79, 1.0), (35, 1.5, 76, 1.0), (35, 3, 72, 1.0),
        (36, 0, 74, 1.5), (36, 2, 77, 1.0), (36, 3.5, 81, 0.5),
        (37, 0, 84, 1.0), (37, 1.5, 81, 1.0), (37, 3, 79, 1.0),
    ]
    for bar_i, off, midi, dur in break_mel:
        t = bar_i * bar + off * b
        mx.add("piano", t, pluck(midi, dur * b, gain=0.3, bright=0.9), pan=0.1)
        mx.add("piano", t, bell(midi, 1.8, gain=0.16))
    # intro sparkles & fx
    for k in range(16):
        mx.add("fx", 1.5 + k * 0.85, bell(86 + (k % 4) * 2, 2.2, gain=0.06))
    mx.add("fx", 8 * bar - 5.0, reverse_cymbal(5.0, 0.5), 0.6)
    mx.add("fx", 14 * bar, riser(bar * 2, 0.7), 0.8)
    mx.add("fx", 36 * bar, riser(bar * 2, 0.8), 0.85)
    mx.add("fx", 49.5 * bar, impact(3.0), 0.5)
    mx.add("fx", 50 * bar, reverse_cymbal(3.0, 0.35), 0.7)

    # sidechain + gains
    sc_full = np.ones(mx.n + SR * 3)
    sc_full[: mx.n] = sc
    for stem in ("bass", "sub", "pad", "stab"):
        if stem in mx.bus:
            mx.bus[stem] *= sc_full[:, None]
    gains = {
        "kick": 0.9, "snare": 0.7, "hat": 0.45, "clap": 0.5, "crash": 0.45,
        "bass": 0.65, "sub": 0.62, "pad": 0.7, "stab": 0.8, "bell": 0.6,
        "pluck": 0.5, "lead": 0.8, "lead_harm": 0.5, "piano": 0.7, "fx": 0.55,
        "impact": 0.65,
    }
    mix = np.zeros((mx.n, 2))
    for stem, buf in mx.bus.items():
        mix += buf[: mx.n] * gains.get(stem, 0.5)
    send = np.zeros_like(mix)
    for stem, amt in (("lead", 0.34), ("bell", 0.4), ("pluck", 0.3), ("piano", 0.4),
                      ("pad", 0.2), ("snare", 0.2), ("clap", 0.18), ("stab", 0.18)):
        if stem in mx.bus:
            send += mx.bus[stem][: mx.n] * amt
    mix = convolve_reverb(mix, send, wet=0.6, length=2.2)
    ds = np.zeros_like(mix)
    if "bell" in mx.bus:
        ds += mx.bus["bell"][: mx.n] * 0.5
    if "lead" in mx.bus:
        ds += mx.bus["lead"][: mx.n] * 0.3
    mix = delay_fx(mix, ds, time=0.625, feedback=0.45, wet=0.3)
    mix = master(mix, mud=-1.0, presence=0.7, air=1.8, drive=1.55, wet=0.40,
                 thr=0.30, ratio=2.5, low_cut=25.0, target_rms=0.255)
    out = np.zeros((int(seconds * SR), 2))
    k = min(len(out), len(mix))
    out[:k] = mix[:k]
    fade = int(1.5 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out, {
        "id": "frostlight", "bpm": bpm, "bars": bars, "duration": seconds,
        "sections": [
            {"name": "intro", "startBar": 0, "endBar": 8},
            {"name": "build", "startBar": 8, "endBar": 16},
            {"name": "drop1", "startBar": 16, "endBar": 30},
            {"name": "break", "startBar": 30, "endBar": 38},
            {"name": "drop2", "startBar": 38, "endBar": 50},
            {"name": "outro", "startBar": 50, "endBar": 54},
        ],
        "impacts": [16, 30, 38, 46, 50],
    }


# ----------------------------------------------------------------------------
# Track 3 — ION RUSH (200 BPM, F# minor, hardcore / speedcore)
# ----------------------------------------------------------------------------
def build_ion_rush():
    bpm, bars, seconds = 200, 75, 90.0
    b = 60 / bpm
    bar = b * 4
    mx = Mixer(seconds)

    prog = [(42, "min"), (38, "maj"), (45, "maj"), (40, "maj")]  # F#m D A E
    bass_roots = [30, 26, 33, 28]

    def chord_at(i):
        return prog[(i // 2) % 4]

    def bass_at(i):
        return bass_roots[(i // 2) % 4]

    kick_times = []

    # --- pads, 2 bars each
    for bar_i in range(0, bars, 2):
        root_pc, qual = chord_at(bar_i)
        loud = 16 <= bar_i < 66
        mx.add(
            "pad", bar_i * bar,
            pad_chord(chord_notes(root_pc, qual, 3), bar * 2, 1.0,
                      cutoff=650 + (1500 if loud else 0),
                      attack=1.0 if bar_i < 8 else 0.22, release=1.4),
            0.30 if loud else 0.38,
        )

    # --- intro 0..8
    mx.add("fx", 0.0, impact(3.2), 0.45)
    for bar_i in range(4, 8):
        for k in range(4):
            t = bar_i * bar + k * b
            kick_times.append(t)
            mx.add("kick", t, kick_hard(), 0.95)
            if k % 2 == 1:
                mx.add("hat", t, hat(False), 0.45, pan=0.25)
        mx.add("sub", bar_i * bar, sub_note(bass_at(bar_i), bar * 0.9, 0.9), 0.42)
    mx.add("fx", 6 * bar, riser(bar * 2, 0.75), 0.7)
    mx.add("fx", 7.5 * bar, reverse_cymbal(bar * 0.5, 0.6), 0.6)

    # --- build 8..16
    for bar_i in range(8, 16):
        for k in range(4):
            t = bar_i * bar + k * b
            kick_times.append(t)
            mx.add("kick", t, kick_hard(), 0.95)
            mx.add("hat", t + b * 0.5, hat(False), 0.32, pan=-0.2)
        mx.add("snare", bar_i * bar + b, snare_hard(), 0.60)
        mx.add("snare", bar_i * bar + 3 * b, snare_hard(), 0.64)
        if bar_i % 2 == 0:
            root_pc, qual = chord_at(bar_i)
            mx.add("stab", bar_i * bar, hoover_stab(chord_notes(root_pc, qual, 3), b * 1.4, 0.9), 0.45)
        if bar_i >= 12:
            pat = [0, 12, 0, 7, 10, 0, 12, 7]
            for i, off in enumerate(pat):
                mx.add("acid", bar_i * bar + i * b * 0.5,
                       acid_note(bass_at(bar_i) + off, b * 0.42, 0.9), 0.42, pan=-0.1)
    for i in range(16):
        mx.add("snare", 15 * bar + i * b * 0.25, snare_hard(), 0.16 + i * 0.028)
    mx.add("fx", 14 * bar, riser(bar * 2, 0.95, 200, 12000), 0.9)

    # --- lead riff (4 bars) used in drops
    riff = [
        (0, 78, 0.5), (0.5, 78, 0.5), (1, 81, 1.0), (2, 78, 0.5), (2.5, 73, 0.5), (3, 76, 1.0),
        (4, 78, 0.5), (4.5, 81, 0.5), (5, 85, 1.0), (6, 84, 1.0), (7, 81, 1.0),
        (8, 78, 1.0), (9, 73, 1.0), (10, 76, 1.0), (11, 78, 1.0),
        (12, 81, 2.0), (14, 80, 1.0), (15, 76, 1.0),
    ]

    def play_riff(start_bar, transpose=0, gain=0.7):
        for off, midi, dur in riff:
            t = start_bar * bar + off * b
            mx.add("lead", t, lead_note(midi + transpose, dur * b, bright=1.15, gain=1.0,
                                        vib=0.012, voices=5), gain, pan=0.06)
            mx.add("lead2", t, lead_note(midi + transpose - 12, dur * b, bright=0.7,
                                         gain=1.0, voices=3), gain * 0.45, pan=-0.26)

    def drums_drop(bar_i, extra=False):
        base = bar_i * bar
        for k in range(4):
            t = base + k * b
            kick_times.append(t)
            mx.add("kick", t, kick_hard(), 0.98)
            mx.add("hat", t + b * 0.5, hat(True), 0.26, pan=-0.15)
        if extra:
            for k in (1, 3):
                t = base + k * b + b * 0.5
                mx.add("kick", t, kick_hard(0.3), 0.55, pan=-0.1)
        mx.add("snare", base + b, snare_hard(), 0.66)
        mx.add("snare", base + 3 * b, snare_hard(), 0.70)
        if bar_i % 4 == 3:
            for i in range(4):
                mx.add("snare", base + 3 * b + i * b * 0.25, snare_hard(0.2), 0.22 + i * 0.06)
        root = bass_at(bar_i)
        pat = [0, 0, 12, 0, 7, 0, 10, 12]
        for i, off in enumerate(pat):
            mx.add("acid", base + i * b * 0.5, acid_note(root + off, b * 0.4, 0.9, cut=1900),
                   0.40, pan=-0.12)
        if bar_i % 2 == 0:
            root_pc, qual = chord_at(bar_i)
            mx.add("stab", base, hoover_stab(chord_notes(root_pc, qual, 3), b * 1.2, 1.0), 0.48)
        mx.add("sub", base, sub_note(root, bar * 0.95, 0.9), 0.50)

    # --- drop 1 16..34
    mx.add("fx", 16 * bar, impact(2.8), 0.75)
    for bar_i in range(16, 34):
        drums_drop(bar_i)
    for sb in (20, 28):
        play_riff(sb, 0, 0.62)
    for i in range(16):
        mx.add("snare", 33 * bar + i * b * 0.25, snare_hard(), 0.14 + i * 0.03)

    # --- break 34..42
    mx.add("fx", 34 * bar, impact(3.2), 0.65)
    mx.add("fx", 34 * bar, reverse_cymbal(2.5, 0.5), 0.6)
    for bar_i in range(34, 42):
        root_pc, qual = chord_at(bar_i)
        if bar_i % 2 == 0:
            mx.add("pad", bar_i * bar,
                   pad_chord(chord_notes(root_pc, qual, 4), bar * 2, 1.0,
                             cutoff=2600, attack=0.35, release=1.6), 0.42)
        tones = [0, 3, 7, 10, 14, 10, 7, 3]
        for i in range(8):
            midi = root_pc + 12 + tones[i]
            mx.add("bell", bar_i * bar + i * b * 0.5, bell(midi, 1.4, 0.6), 0.26,
                   pan=(-0.3 + i * 0.09))
        mx.add("sub", bar_i * bar, sub_note(bass_at(bar_i), bar * 0.9, 0.9), 0.50)
    for i in range(16):
        mx.add("snare", 40 * bar + i * b * 0.5, snare_hard(), 0.10 + i * 0.032)
    mx.add("fx", 40 * bar, riser(bar * 2, 0.95, 200, 12000), 0.85)

    # --- drop 2 42..66
    mx.add("fx", 42 * bar, impact(3.0), 0.85)
    mx.add("fx", 42 * bar, crash(2.4), 0.5)
    for bar_i in range(42, 66):
        drums_drop(bar_i, extra=(bar_i % 4 == 3))
    for n, sb in enumerate((44, 48, 52, 56, 60)):
        play_riff(sb, 12 if n % 2 else 0, 0.66)
    for i in range(16):
        mx.add("snare", 65 * bar + i * b * 0.25, snare_hard(), 0.14 + i * 0.03)

    # --- outro 66..75
    mx.add("fx", 66 * bar, impact(3.6), 0.7)
    for bar_i in range(66, 75):
        root_pc, qual = chord_at(bar_i)
        if bar_i % 2 == 0:
            mx.add("pad", bar_i * bar,
                   pad_chord(chord_notes(root_pc, qual, 3), bar * 2, 1.0,
                             cutoff=1200, attack=0.8, release=2.0), 0.40)
        tones = [0, 7, 12, 10, 7, 3]
        for i in range(6):
            mx.add("bell", bar_i * bar + i * b * 0.75, bell(root_pc + 12 + tones[i], 1.8, 0.5),
                   0.22, pan=(-0.24 + i * 0.1))
        if bar_i < 70:
            mx.add("kick", bar_i * bar, kick_hard(), 0.7 - (bar_i - 66) * 0.1)
        mx.add("sub", bar_i * bar, sub_note(bass_at(bar_i), bar * 0.95, 0.9), 0.42)

    # --- sidechain + mix
    sc = sidechain_env(kick_times, mx.n + SR * 3, depth=0.55, release=0.12)
    for stem in ("bass", "acid", "sub", "pad", "stab", "lead2"):
        if stem in mx.bus:
            mx.bus[stem] *= sc[:, None]

    gains = {
        "kick": 0.92, "snare": 0.68, "hat": 0.42, "clap": 0.4, "crash": 0.4,
        "acid": 0.52, "sub": 0.55, "pad": 0.42, "stab": 0.5, "lead": 0.72,
        "lead2": 0.42, "bell": 0.5, "fx": 0.5, "impact": 0.7,
    }
    mix = np.zeros((mx.n, 2))
    for stem, buf in mx.bus.items():
        mix += buf[: mx.n] * gains.get(stem, 0.45)
    send = np.zeros_like(mix)
    for stem, amt in (("lead", 0.22), ("lead2", 0.2), ("stab", 0.14), ("bell", 0.3),
                      ("snare", 0.16), ("acid", 0.12)):
        if stem in mx.bus:
            send += mx.bus[stem][: mx.n] * amt
    mix = convolve_reverb(mix, send, wet=0.34, length=1.5)
    ds = np.zeros_like(mix)
    if "lead" in mx.bus:
        ds += mx.bus["lead"][: mx.n] * 0.4
    mix = delay_fx(mix, ds, time=b * 0.75, feedback=0.32, wet=0.18)
    mix = master(mix, mud=-1.8, presence=1.2, air=0.9, drive=2.3, wet=0.52,
                 thr=0.30, ratio=3.2, low_cut=28.0, target_rms=0.315)
    out = np.zeros((int(seconds * SR), 2))
    k = min(len(out), len(mix))
    out[:k] = mix[:k]
    fade = int(1.2 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out, {
        "id": "ion-rush", "bpm": bpm, "bars": bars, "duration": seconds,
        "sections": [
            {"name": "intro", "startBar": 0, "endBar": 8},
            {"name": "build", "startBar": 8, "endBar": 16},
            {"name": "drop1", "startBar": 16, "endBar": 34},
            {"name": "break", "startBar": 34, "endBar": 42},
            {"name": "drop2", "startBar": 42, "endBar": 66},
            {"name": "outro", "startBar": 66, "endBar": 75},
        ],
        "impacts": [16, 26, 34, 42, 50, 58, 66],
    }


# ----------------------------------------------------------------------------
# Track 4 — VELVET STATIC (88 BPM, Eb major, lo-fi jazz-hop)
# ----------------------------------------------------------------------------
def build_velvet_static():
    bpm, bars, seconds = 88, 33, 90.0
    b = 60 / bpm
    bar = b * 4
    mx = Mixer(seconds)

    prog = [(39, "maj7"), (36, "min"), (44, "maj7"), (46, "maj")]  # Ebmaj7 Cm7 Abmaj7 Bb7
    bass_roots = [27, 24, 32, 34]

    def chord_at(i):
        return prog[(i // 2) % 4]

    def bass_at(i):
        return bass_roots[(i // 2) % 4]

    # vinyl crackle bed
    for k in range(90):
        mx.add("vinyl", k, vinyl(), 0.9, pan=(-0.2 if k % 2 else 0.2))

    # rhodes chords, 2 bars each
    for bar_i in range(0, bars, 2):
        root_pc, qual = chord_at(bar_i)
        dur = bar * 2.1
        for j, m in enumerate(chord_notes(root_pc, qual, 3)):
            mx.add("rhodes", bar_i * bar + j * 0.016, rhodes(m, dur, 0.9), 0.30,
                   pan=(-0.28 + j * 0.14))

    kick_times = []
    # --- drums + walking bass 2..29
    for bar_i in range(2, 30):
        base = bar_i * bar
        offs = (0.0, 2.5) if bar_i < 20 else (0.0, 1.75, 2.5)
        for off in offs:
            t = base + off * b
            kick_times.append(t)
            mx.add("kick", t, kick_lofi(), 0.88)
        if bar_i >= 4:
            mx.add("snare", base + b, snare_brush(), 0.52)
            mx.add("snare", base + 3 * b, snare_brush(), 0.55)
        for i in range(8):
            t = base + i * 0.5 * b + (0.06 * b if i % 2 else 0.0)
            mx.add("hat", t, hat(False), 0.20 + (0.05 if i % 2 == 0 else 0.0),
                   pan=(0.32 if i % 2 else -0.32))
        if bar_i % 2 == 1:
            mx.add("hat", base + 3.5 * b + 0.06 * b, hat(True), 0.16, pan=0.2)
        root = bass_at(bar_i)
        walk = [0, 7, 10, 7, 12, 10, 7, 3]
        for i in range(4):
            mx.add("bass", base + i * b,
                   bass_note(root + walk[i], b * 0.92, 0.9, drive=0.45, bright=0.3),
                   0.55, pan=0.02)

    def chord_pad(bar_i, dur_mult=2.0, cutoff=1400, gain=0.30):
        root_pc, qual = chord_at(bar_i)
        mx.add("warmpad", bar_i * bar,
               pad_chord(chord_notes(root_pc, qual, 4), bar * dur_mult, 1.0,
                         cutoff=cutoff, attack=1.2, release=2.2), gain)

    chord_pad(0, 8.0, 900, 0.22)
    for bar_i in range(8, 30, 2):
        chord_pad(bar_i, 2.2, 1500, 0.16)

    # melody
    mel = [
        (0, 75, 1.0), (1, 72, 0.5), (1.5, 75, 0.5), (2, 77, 2.0),
        (4, 75, 1.0), (5, 70, 1.0), (6, 72, 1.0), (7, 74, 1.0),
        (8, 75, 1.5), (9.5, 77, 0.5), (10, 79, 2.0),
        (12, 77, 1.0), (13, 75, 1.0), (14, 72, 2.0),
    ]

    def play_mel(start_bar, gain=0.5):
        for off, midi, dur in mel:
            mx.add("lead", start_bar * bar + off * b, muted_lead(midi, dur * b, 1.0),
                   gain, pan=0.1)
            if dur >= 1.5:
                mx.add("bell", start_bar * bar + off * b, bell(midi + 12, 1.4, 0.4), gain * 0.35)

    for sb in (8, 20):
        play_mel(sb)
    # sparse answers in the bridge
    for off, midi, dur in ((0, 70, 1.5), (2, 68, 1.5), (4, 75, 2.0), (7, 72, 1.0)):
        mx.add("lead", 16 * bar + off * b, muted_lead(midi, dur * b, 1.0), 0.45, pan=-0.12)

    # --- intro fx
    mx.add("fx", 0.0, reverse_cymbal(1.6, 0.25), 0.5)
    mx.add("fx", 4 * bar - 0.9, riser(1.4, 0.30, 300, 5000), 0.4)
    mx.add("fx", 16 * bar - 0.8, reverse_cymbal(1.2, 0.3), 0.5)
    mx.add("fx", 20 * bar - 1.0, riser(1.6, 0.32, 300, 6000), 0.45)
    # final hits
    mx.add("fx", 29 * bar, crash(2.6), 0.22)
    mx.add("fx", 32 * bar, reverse_cymbal(2.0, 0.3), 0.5)

    sc = sidechain_env(kick_times, mx.n + SR * 3, depth=0.35, release=0.20)
    for stem in ("bass", "warmpad", "rhodes"):
        if stem in mx.bus:
            mx.bus[stem] *= sc[:, None]

    gains = {
        "kick": 0.78, "snare": 0.55, "hat": 0.34, "vinyl": 0.9, "bass": 0.52,
        "rhodes": 0.62, "warmpad": 0.42, "lead": 0.55, "bell": 0.38,
        "fx": 0.35, "crash": 0.3,
    }
    mix = np.zeros((mx.n, 2))
    for stem, buf in mx.bus.items():
        mix += buf[: mx.n] * gains.get(stem, 0.4)
    send = np.zeros_like(mix)
    for stem, amt in (("rhodes", 0.34), ("lead", 0.3), ("bell", 0.4), ("snare", 0.2),
                      ("warmpad", 0.24)):
        if stem in mx.bus:
            send += mx.bus[stem][: mx.n] * amt
    mix = convolve_reverb(mix, send, wet=0.55, length=2.8)
    ds = np.zeros_like(mix)
    if "lead" in mx.bus:
        ds += mx.bus["lead"][: mx.n] * 0.45
    mix = delay_fx(mix, ds, time=b * 0.75, feedback=0.34, wet=0.2)
    mix = lp(mix.T, 8200).T
    mix = master(mix, mud=-1.4, presence=0.3, air=0.7, drive=2.2, wet=0.46,
                 thr=0.24, ratio=2.8, low_cut=28.0, target_rms=0.225)
    out = np.zeros((int(seconds * SR), 2))
    k = min(len(out), len(mix))
    out[:k] = mix[:k]
    fade = int(2.4 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out, {
        "id": "velvet-static", "bpm": bpm, "bars": bars, "duration": seconds,
        "sections": [
            {"name": "intro", "startBar": 0, "endBar": 4},
            {"name": "build", "startBar": 4, "endBar": 8},
            {"name": "drop1", "startBar": 8, "endBar": 16},
            {"name": "break", "startBar": 16, "endBar": 20},
            {"name": "drop2", "startBar": 20, "endBar": 29},
            {"name": "outro", "startBar": 29, "endBar": 33},
        ],
        "impacts": [8, 16, 20, 24, 29],
    }


# ----------------------------------------------------------------------------
# Track 5 — GLASS TIDE (112 BPM, C# minor, ambient / IDM)
# ----------------------------------------------------------------------------
def build_glass_tide():
    bpm, bars, seconds = 112, 42, 90.0
    b = 60 / bpm
    bar = b * 4
    mx = Mixer(seconds)

    prog = [(37, "min9"), (45, "maj9"), (40, "maj"), (47, "sus2")]  # C#m9 Amaj9 E Bsus2
    bass_roots = [25, 33, 28, 35]

    def chord_at(i):
        return prog[(i // 2) % 4]

    def bass_at(i):
        return bass_roots[(i // 2) % 4]

    kick_times = []

    # --- long pads through the whole track
    for bar_i in range(0, bars, 2):
        root_pc, qual = chord_at(bar_i)
        bright = 1.0 if 14 <= bar_i < 38 else 0.55
        mx.add("pad", bar_i * bar,
               pad_chord(chord_notes(root_pc, qual, 4), bar * 2.2, 1.0,
                         cutoff=900 + 900 * bright, attack=1.4, release=2.6), 0.42)
        mx.add("sub", bar_i * bar, sub_note(bass_at(bar_i), bar * 1.9, 0.9), 0.46)

    # --- glass arpeggio
    def arp(bar_i, gain=0.26, dense=False):
        root_pc, qual = chord_at(bar_i)
        tones = chord_notes(root_pc, qual, 5)
        pat = list(range(16)) if dense else [0, 2, 5, 7, 10, 12, 14]
        for i in pat:
            m = tones[i % len(tones)]
            mx.add("glass", bar_i * bar + i * b * 0.25,
                   glass(m, 1.4, 0.7), gain, pan=(-0.35 + 0.09 * (i % 8)))

    for bar_i in range(0, 14):
        arp(bar_i, 0.20)
    for bar_i in range(14, 38):
        arp(bar_i, 0.24, dense=(bar_i % 4 == 3))

    # --- glitch percussion / texture
    for bar_i in range(6, 38):
        base = bar_i * bar
        for i in range(8):
            if (bar_i * 8 + i) % 5 == 2:
                t = base + i * b * 0.5 + (0.25 * b if i % 2 else 0)
                n = int(0.05 * SR)
                g = bp(rng.normal(0, 1, n), 2500, 9000) * np.exp(-tt(n) * 90)
                mx.add("glitch", t, g, 0.16, pan=(-0.5 if i % 2 else 0.5))
        if bar_i % 4 == 0:
            mx.add("crash", base, crash(2.0), 0.22)

    # --- drums
    for bar_i in range(6, 38):
        base = bar_i * bar
        if bar_i in (26, 27, 28):  # beatless break
            continue
        for k in (0, 2):
            t = base + k * b
            kick_times.append(t)
            mx.add("kick", t, kick("soft"), 0.7)
        if bar_i >= 14:
            for k in (1, 3):
                mx.add("snare", base + k * b, snare_brush(0.22), 0.30, pan=0.1)
            for i in range(8):
                if bar_i >= 32 or i % 2 == 0:
                    mx.add("hat", base + i * b * 0.5, hat(False), 0.14,
                           pan=(0.35 if i % 2 else -0.35))

    # --- melody (glass bells + soft lead)
    mel = [
        (0, 73, 1.5), (1.5, 76, 1.0), (2.5, 80, 2.0),
        (5, 78, 1.0), (6, 76, 1.0), (7, 73, 2.0),
        (9, 75, 1.0), (10, 73, 1.0), (11, 71, 2.0),
        (13, 73, 1.5), (14.5, 76, 1.5),
    ]

    def play_mel(start_bar, gain=0.42):
        for off, midi, dur in mel:
            t = start_bar * bar + off * b
            mx.add("lead", t, lead_note(midi, dur * b, bright=0.45, gain=1.0,
                                        vib=0.02, voices=4), gain, pan=0.12)
            mx.add("glass", t, glass(midi + 12, 2.0, 0.6), gain * 0.6, pan=-0.2)

    for sb in (14, 32):
        play_mel(sb, 0.40)

    # --- transitions
    mx.add("fx", 0.0, reverse_cymbal(4.0, 0.35), 0.55)
    mx.add("fx", 6 * bar, riser(bar * 3, 0.45, 200, 7000), 0.5)
    mx.add("fx", 12 * bar, riser(bar * 2, 0.6, 300, 9000), 0.55)
    mx.add("fx", 14 * bar, impact(3.4), 0.5)
    mx.add("fx", 25 * bar, reverse_cymbal(bar * 2, 0.5), 0.6)
    mx.add("fx", 26 * bar, impact(4.0), 0.45)
    mx.add("fx", 31 * bar, riser(bar * 2, 0.6, 250, 8000), 0.55)
    mx.add("fx", 32 * bar, impact(3.2), 0.55)
    mx.add("fx", 38 * bar, impact(3.6), 0.4)
    mx.add("fx", 41 * bar, reverse_cymbal(2.0, 0.3), 0.5)

    sc = sidechain_env(kick_times, mx.n + SR * 3, depth=0.4, release=0.22)
    for stem in ("bass", "sub", "pad", "glass"):
        if stem in mx.bus:
            mx.bus[stem] *= sc[:, None]

    gains = {
        "kick": 0.62, "snare": 0.4, "hat": 0.28, "crash": 0.3, "glitch": 0.4,
        "sub": 0.5, "pad": 0.46, "glass": 0.4, "lead": 0.42, "fx": 0.42,
        "impact": 0.5,
    }
    mix = np.zeros((mx.n, 2))
    for stem, buf in mx.bus.items():
        mix += buf[: mx.n] * gains.get(stem, 0.35)
    send = np.zeros_like(mix)
    for stem, amt in (("glass", 0.55), ("lead", 0.5), ("pad", 0.35), ("snare", 0.3),
                      ("glitch", 0.3)):
        if stem in mx.bus:
            send += mx.bus[stem][: mx.n] * amt
    mix = convolve_reverb(mix, send, wet=0.78, length=4.5)
    ds = np.zeros_like(mix)
    for stem, amt in (("glass", 0.55), ("lead", 0.35)):
        if stem in mx.bus:
            ds += mx.bus[stem][: mx.n] * amt
    mix = delay_fx(mix, ds, time=b * 0.75, feedback=0.5, wet=0.34, pingpong=True)
    mix = master(mix, mud=-0.9, presence=0.5, air=2.4, drive=1.45, wet=0.32,
                 thr=0.26, ratio=2.2, low_cut=25.0, target_rms=0.248)
    out = np.zeros((int(seconds * SR), 2))
    k = min(len(out), len(mix))
    out[:k] = mix[:k]
    fade = int(3.0 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out, {
        "id": "glass-tide", "bpm": bpm, "bars": bars, "duration": seconds,
        "sections": [
            {"name": "intro", "startBar": 0, "endBar": 6},
            {"name": "build", "startBar": 6, "endBar": 14},
            {"name": "drop1", "startBar": 14, "endBar": 26},
            {"name": "break", "startBar": 26, "endBar": 32},
            {"name": "drop2", "startBar": 32, "endBar": 38},
            {"name": "outro", "startBar": 38, "endBar": 42},
        ],
        "impacts": [14, 26, 32, 38],
    }


# ----------------------------------------------------------------------------
# io
# ----------------------------------------------------------------------------
def save_wav(path, audio):
    audio = np.clip(audio, -1, 1)
    pcm = (audio * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def encode_m4a(wav_path, m4a_path):
    cmd = ["afconvert", "-f", "m4af", "-d", "aac", "-b", "256000", wav_path, m4a_path]
    subprocess.run(cmd, check=True, capture_output=True)
    return os.path.getsize(m4a_path)


def analyze(audio):
    rms = float(np.sqrt(np.mean(audio ** 2)))
    peak = float(np.abs(audio).max())
    # crude short-term dynamics
    mono = audio.mean(axis=1)
    blocks = mono[: len(mono) // SR * SR].reshape(-1, SR)
    db = 20 * np.log10(np.sqrt((blocks ** 2).mean(axis=1)) + 1e-9)
    return {"rms": round(rms, 4), "peak": round(peak, 4),
            "loudness_db": round(float(db.mean()), 2), "seconds": len(audio) / SR}


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    metas = {}
    if which in ("all", "neon-pulse"):
        print("composing NEON PULSE ...", flush=True)
        audio, meta = build_neon_pulse()
        wav = os.path.join(AUDIO, "neon-pulse.wav")
        save_wav(wav, audio)
        size = encode_m4a(wav, os.path.join(AUDIO, "neon-pulse.m4a"))
        print("  ", analyze(audio), "m4a", size, flush=True)
        metas["neon-pulse"] = meta
        os.remove(wav)
    if which in ("all", "frostlight"):
        print("composing FROSTLIGHT ...", flush=True)
        audio, meta = build_frostlight()
        wav = os.path.join(AUDIO, "frostlight.wav")
        save_wav(wav, audio)
        size = encode_m4a(wav, os.path.join(AUDIO, "frostlight.m4a"))
        print("  ", analyze(audio), "m4a", size, flush=True)
        metas["frostlight"] = meta
        os.remove(wav)
    for tid, builder, label in (
        ("ion-rush", build_ion_rush, "ION RUSH"),
        ("velvet-static", build_velvet_static, "VELVET STATIC"),
        ("glass-tide", build_glass_tide, "GLASS TIDE"),
    ):
        if which not in ("all", tid):
            continue
        print("composing %s ..." % label, flush=True)
        audio, meta = builder()
        wav = os.path.join(AUDIO, tid + ".wav")
        save_wav(wav, audio)
        size = encode_m4a(wav, os.path.join(AUDIO, tid + ".m4a"))
        print("  ", analyze(audio), "m4a", size, flush=True)
        metas[tid] = meta
        os.remove(wav)
    if metas:
        path = os.path.join(DATA, "track-meta.json")
        old = {}
        if os.path.exists(path):
            with open(path) as f:
                old = json.load(f)
        old.update(metas)
        with open(path, "w") as f:
            json.dump(old, f, indent=2)
        # js mirror so the game can run without fetch
        with open(os.path.join(ROOT, "js", "track-meta.js"), "w") as f:
            f.write("// generated by tools/make_music.py\n")
            f.write("window.TRACK_META = " + json.dumps(old, indent=2) + ";\n")
        print("wrote data/track-meta.json + js/track-meta.js")


if __name__ == "__main__":
    main()
