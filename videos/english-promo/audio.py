"""Synthesises the soundtrack (music + sound effects) for the video -> out/audio.wav.

Timings mirror the timeline in index.html.
"""
import os
import wave

import numpy as np

SR = 44100
DUR = 41.0
N = int(SR * DUR)
rng = np.random.default_rng(3)
music = np.zeros(N)
sfx = np.zeros(N)


def add(buf, sig, t0, gain=1.0):
    i = int(t0 * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def ts(dur):
    return np.arange(int(SR * dur)) / SR


def freq(m):
    return 440 * 2 ** ((m - 69) / 12)


def env(t, a=0.005, d=0.3):
    return np.minimum(1, t / a) * np.exp(-t / d)


def lowpass(x, k):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc)
        y[i] = acc
    return y


# ---------- instruments ----------
def pluck(m, dur=0.45, d=0.2):
    t = ts(dur)
    f = freq(m)
    s = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.06)
         + 0.25 * np.sin(6 * np.pi * f * t) * np.exp(-t / 0.03))
    return s * env(t, 0.003, d)


def bass(m, dur=0.4):
    t = ts(dur)
    f = freq(m)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return s * env(t, 0.005, 0.25)


def pad(ms, dur):
    t = ts(dur)
    s = sum(np.sin(2 * np.pi * freq(m) * t) + 0.3 * np.sin(2 * np.pi * freq(m) * 1.003 * t) for m in ms)
    e = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.4)
    return s * e / len(ms)


def kick():
    t = ts(0.25)
    f = 45 + 90 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)


def hat():
    t = ts(0.05)
    n = rng.standard_normal(len(t))
    return np.diff(n, prepend=0) * np.exp(-t / 0.012) * 0.3


def clap():
    t = ts(0.2)
    n = rng.standard_normal(len(t))
    return (np.diff(n, prepend=0) * 0.5 + 0.3 * np.sin(2 * np.pi * 190 * t)) * np.exp(-t / 0.06)


def tick():
    t = ts(0.03)
    return np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.006)


# ---------- sound effects ----------
def pop():
    t = ts(0.12)
    f = 380 + 700 * t / 0.12
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.04)


def whoosh(dur=0.45, up=True):
    t = ts(dur)
    n = rng.standard_normal(len(t))
    k = np.linspace(0.02, 0.35, len(t)) if up else np.linspace(0.35, 0.02, len(t))
    y = np.empty_like(n)
    acc = 0.0
    for i, v in enumerate(n):
        acc += k[i] * (v - acc)
        y[i] = acc
    return y * np.sin(np.pi * t / dur) ** 2 * 1.6


def key_click():
    t = ts(0.02)
    return rng.standard_normal(len(t)) * np.exp(-t / 0.004) * 0.25 + np.sin(2 * np.pi * 1600 * t) * np.exp(-t / 0.003) * 0.2


def trombone(m, dur):
    t = ts(dur)
    f = freq(m) * (1 + 0.012 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.15))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = sum(np.sin(h * ph) / h for h in range(1, 8))
    s = lowpass(s, 0.18)
    return s * np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / 0.08)


def bell(m=84, dur=1.6):
    t = ts(dur)
    f = freq(m)
    return sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d)
               for r, a, d in [(1, 1, .8), (2.76, .5, .4), (5.4, .25, .2), (8.9, .12, .1)])


def sparkle(dur=0.8):
    out = np.zeros(int(SR * dur))
    for i in range(10):
        s = pluck(84 + int(rng.integers(0, 14)), 0.3, 0.08)
        st = int(i / 10 * dur * SR * 0.8)
        out[st:st + len(s)] += s[: len(out) - st] * 0.5
    return out


# ---------- music ----------
BPM = 112
BEAT = 60 / BPM
MAJOR = [([60, 64, 67, 72], 48), ([59, 62, 67, 71], 43), ([57, 60, 64, 69], 45), ([57, 60, 65, 69], 41)]  # C G Am F
MINOR = [([57, 60, 64, 69], 45), ([57, 60, 65, 69], 41), ([55, 60, 64, 67], 48), ([55, 59, 62, 67], 43)]  # Am F C G
ARP = [0, 1, 2, 3, 2, 1, 2, 3]


def groove(start, end, prog, drums=True, clapon=True, octave=0, gain=1.0):
    bar = 4 * BEAT
    b = 0
    while start + b * bar < end:
        t0 = start + b * bar
        notes, root = prog[b % len(prog)]
        for i, idx in enumerate(ARP):
            tt = t0 + i * BEAT / 2
            if tt < end:
                add(music, pluck(notes[idx] + octave), tt, 0.22 * gain)
        for beat, m in [(0, root), (1.5, root), (2, root), (3, root + 7)]:
            if t0 + beat * BEAT < end:
                add(music, bass(m), t0 + beat * BEAT, 0.35 * gain)
        if drums:
            for beat in range(4):
                bt = t0 + beat * BEAT
                if bt >= end:
                    break
                if beat in (0, 2):
                    add(music, kick(), bt, 0.55 * gain)
                elif clapon:
                    add(music, clap(), bt, 0.18 * gain)
                add(music, hat(), bt + BEAT / 2, 0.5 * gain)
        b += 1


# 0 - 6.5 : light & curious
groove(0.0, 6.5, MAJOR, drums=True, clapon=False, gain=0.8)
# 6.5 - 11.0 : tension (pulsing low A + clock)
for k in range(int((11.0 - 6.6) / (BEAT / 2))):
    add(music, bass(33 if k % 4 else 45, 0.3), 6.6 + k * BEAT / 2, 0.35)
for k in range(int((11.0 - 6.6) / BEAT)):
    add(music, tick(), 6.6 + k * BEAT, 0.5)
add(music, pad([45, 52, 57], 4.6), 6.5, 0.25)
# 13.6 - 19 : soft minor
for i in range(int((19.0 - 13.6) / BEAT)):
    notes, root = MINOR[(i // 4) % 4]
    add(music, pluck(notes[i % 4], 0.8, 0.35), 13.6 + i * BEAT, 0.2)
    if i % 4 == 0:
        add(music, pad(notes[:3], 4 * BEAT + 0.3), 13.6 + i * BEAT, 0.18)
# 19.4 - 41 : bright & upbeat
groove(19.45, 41.0, MAJOR, drums=True, clapon=True, octave=12, gain=1.0)
groove(19.45, 41.0, MAJOR, drums=False, octave=0, gain=0.6)

# fades
t_all = np.arange(N) / SR
music *= np.clip((41.0 - t_all) / 1.6, 0, 1)
# duck music under dialogue
duck = np.ones(N)
for a, b in [(3.8, 5.4), (11.0, 12.4), (29.7, 31.0), (31.1, 34.0)]:
    duck[int(a * SR):int(b * SR)] = 0.65
duck = np.convolve(duck, np.ones(2000) / 2000, mode='same')
music *= duck

# ---------- sfx placement ----------
for t0 in [0.5, 1.3, 12.6, 28.2, 33.2, 35.4]:
    add(sfx, pop(), t0, 0.35)
for a, b in [(3.9, 5.3), (11.1, 12.3), (12.3, 12.9), (29.8, 30.9), (31.2, 32.7), (33.0, 34.0)]:
    for k in np.arange(a, b, 0.065):
        add(sfx, key_click(), k, 0.5)
for t0 in [0.05, 2.6, 28.6]:
    add(sfx, whoosh(0.6), t0, 0.35)
add(sfx, whoosh(0.5), 6.45, 0.5)
for t0 in [7.2 + i * .18 for i in range(8)]:
    add(sfx, pop(), t0, 0.12)
add(sfx, whoosh(0.4, up=False), 10.7, 0.35)
for i, (m, d) in enumerate([(58, .32), (57, .32), (56, .32), (55, 1.0)]):
    add(sfx, trombone(m - 12, d), 12.35 + i * .34, 0.3)
for t0 in [14.5, 15.4, 16.3]:
    add(sfx, whoosh(0.35), t0 - 0.05, 0.4)
add(sfx, pop(), 17.3, 0.3)
add(sfx, whoosh(1.1), 18.4, 0.6)
add(sfx, bell(84), 19.4, 0.4)
add(sfx, sparkle(), 19.5, 0.5)
for m in [72, 76, 79, 84]:
    add(sfx, pluck(m, 0.9, 0.4), 20.9, 0.25)
for t0 in [22.3, 23.2, 24.1, 25.0]:
    add(sfx, pop(), t0, 0.3)
add(sfx, sparkle(1.0), 32.9, 0.6)
add(sfx, bell(88, 1.2), 33.0, 0.25)
add(sfx, pop(), 36.3, 0.4)
add(sfx, whoosh(0.4), 36.95, 0.3)
add(sfx, whoosh(0.4), 37.35, 0.3)
add(sfx, bell(84, 1.6), 37.9, 0.25)

mix = music + sfx
mix = np.tanh(mix * 1.1)
mix = mix / np.max(np.abs(mix)) * 0.89
pcm = (mix * 32767).astype(np.int16)
stereo = np.repeat(pcm[:, None], 2, axis=1)

os.makedirs(os.path.join(os.path.dirname(__file__), 'out'), exist_ok=True)
with wave.open(os.path.join(os.path.dirname(__file__), 'out', 'audio.wav'), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(stereo.tobytes())
print('ok', len(pcm) / SR, 's')
