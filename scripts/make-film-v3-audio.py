"""Original lo-fi score (numpy), UI sound effects, TTS ducking and -16 LUFS mix for OnQ film v3.
No samples, no copyrighted audio: everything is synthesised here."""
import hashlib, json, os, re, subprocess, wave
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
BPM = 92.0
BEAT = 60.0 / BPM
RNG = np.random.default_rng(7)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def _add(buf, t0, sig, gain=1.0, pan=0.0):
    a = int(t0 * SR)
    if a >= buf.shape[0] or a < 0:
        return
    b = min(buf.shape[0], a + len(sig))
    s = sig[: b - a] * gain
    buf[a:b, 0] += s * (1 - max(0, pan))
    buf[a:b, 1] += s * (1 + min(0, pan))


def _t(d):
    return np.arange(int(d * SR)) / SR


def _env(t, a, d, hold=None, rel=0.08):
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    if hold is not None:
        r = np.clip((hold + rel - t) / rel, 0, 1)
        e = e * np.where(t > hold, r, 1)
    return e


def piano(f, dur, vel=1.0):
    t = _t(dur + 0.3)
    s = np.zeros_like(t)
    for k, (amp, dk) in enumerate([(1, 1.0), (0.5, 0.7), (0.28, 0.5), (0.16, 0.35), (0.09, 0.25)], 1):
        s += amp * np.sin(2 * np.pi * f * k * (1 + 0.0004 * k * k) * t) * np.exp(-t / (0.9 * dk + 0.1))
    s *= np.minimum(1, t / 0.004)
    s *= np.clip((dur + 0.25 - t) / 0.25, 0, 1)
    click = RNG.normal(0, 1, len(t)) * np.exp(-t / 0.004) * 0.05
    return (s * 0.5 + click) * vel


def epiano(f, dur, vel=1.0):
    t = _t(dur + 0.4)
    idx = 1.4 * np.exp(-t / 0.35)
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t)) * np.exp(-t / 1.3)
    s += 0.12 * np.sin(2 * np.pi * f * 7 * t) * np.exp(-t / 0.05)
    s *= np.minimum(1, t / 0.006) * np.clip((dur + 0.35 - t) / 0.35, 0, 1)
    return s * 0.45 * vel


def bass(f, dur, vel=1.0):
    t = _t(dur + 0.1)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.25)
    s *= np.minimum(1, t / 0.012) * np.exp(-t / (dur * 1.1 + 0.05)) * np.clip((dur + 0.08 - t) / 0.08, 0, 1)
    return s * 0.7 * vel


def pad(f, dur, vel=1.0):
    t = _t(dur + 1.2)
    s = np.zeros_like(t)
    for c in (-4, 0, 4):
        f2 = f * 2 ** (c / 1200)
        s += np.sin(2 * np.pi * f2 * t + 0.4 * np.sin(2 * np.pi * 0.2 * t))
    e = np.minimum(1, t / 0.9) * np.clip((dur + 1.2 - t) / 1.2, 0, 1)
    return s * e * (0.5 + 0.15 * np.sin(2 * np.pi * 0.11 * t)) * 0.18 * vel


_hp = butter(2, 7000, 'hp', fs=SR, output='sos')
_bp = butter(2, [1400, 6500], 'bp', fs=SR, output='sos')


def kick(vel=1.0):
    t = _t(0.38)
    f = 46 + 90 * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.13) * 0.95 * vel


def snare(vel=1.0):
    t = _t(0.28)
    n = sosfilt(_bp, RNG.normal(0, 1, len(t))) * np.exp(-t / 0.07)
    return (n * 0.55 + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.35) * vel


def rim(vel=1.0):
    t = _t(0.12)
    return (np.sin(2 * np.pi * 410 * t) * np.exp(-t / 0.014) * 0.5 + sosfilt(_bp, RNG.normal(0, 1, len(t))) * np.exp(-t / 0.02) * 0.3) * vel


def hat(vel=1.0, open_=False):
    d = 0.22 if open_ else 0.06
    t = _t(d)
    return sosfilt(_hp, RNG.normal(0, 1, len(t))) * np.exp(-t / (0.09 if open_ else 0.018)) * 0.28 * vel


# ---- score -------------------------------------------------------------------
CHORDS = [  # (name, bass midi, voicing)
    ('Fmaj7', 41, [53, 57, 60, 64]), ('Em7', 40, [52, 55, 59, 62]), ('Dm7', 38, [50, 53, 57, 60]), ('Cmaj7', 36, [55, 59, 60, 64]),
    ('Am7', 45, [57, 60, 64, 67]), ('Gsus', 43, [55, 60, 62, 67]), ('Fmaj7', 41, [53, 57, 60, 64]), ('G7', 43, [55, 59, 62, 65]),
]
HOOK = [  # per bar: (beat, midi, dur_beats)
    [(0, 76, 1), (1.5, 72, .5), (2, 69, 1.5)], [(0, 71, 1), (1.5, 67, .5), (2, 71, 1), (3, 74, 1)],
    [(0, 72, 1.5), (2, 69, .5), (2.5, 72, .5), (3, 74, 1)], [(0, 76, 2), (2.5, 74, .5), (3, 72, 1)],
    [(0, 72, 1), (1, 76, 1), (2, 79, 1.5)], [(0, 74, 1.5), (2, 71, 1), (3, 67, 1)],
    [(0, 69, 1), (1.5, 72, .5), (2, 76, 1), (3.5, 74, .5)], [(0, 71, 2), (2, 74, 1), (3, 67, 1)],
]


def section_level(t, scenes):
    """0 calm, 1 lift (drums in), 2 focus groove, 3 warm outro. scenes: list of (name, start, end)"""
    for n, s, e in scenes:
        if s <= t < e:
            return {'wake': 0, 'pair': 1, 'morning': 1, 'send': 1, 'telegram': 1, 'coding': 2, 'code': 2, 'talk': 2, 'video': 2, 'recap': 3}.get(n, 1)
    return 3


def swing(b):
    """beat position -> seconds with light lo-fi swing on off-8ths"""
    whole = np.floor(b)
    frac = b - whole
    if abs(frac - 0.5) < 1e-6:
        frac = 0.5 + 0.09
    elif abs(frac - 1.5 % 1) < 1e-6 and False:
        pass
    return (whole + frac) * BEAT


def make_music(total, scenes):
    n = int((total + 3) * SR)
    L = np.zeros((n, 2))
    bars = int(total / (BEAT * 4)) + 2
    for bar in range(bars):
        t0 = bar * BEAT * 4
        if t0 > total + 1:
            break
        lvl = section_level(t0, scenes)
        name, broot, voic = CHORDS[bar % 8]
        # pad: swells in during calm, constant after
        padv = 0.55 if lvl == 0 else 0.4
        for m in voic:
            _add(L, t0, pad(hz(m - 12), BEAT * 4, padv), 1.0, pan=0.0)
        # electric piano chords: slow arpeggio in calm, comping later
        if lvl == 0:
            if t0 > 3:
                for i, m in enumerate(voic):
                    _add(L, t0 + i * BEAT * 0.5 + 0.02, epiano(hz(m), BEAT * 2, 0.5), 1.0, pan=-0.15)
        else:
            for beat, v in ((0, 0.85), (1.5, 0.6), (2.5, 0.55) if lvl >= 2 else (2, 0.55)):
                for m in voic:
                    _add(L, t0 + swing(beat), epiano(hz(m), BEAT * 1.3, 0.55 * v), 1.0, pan=-0.2)
        # bass
        if t0 >= 8:
            if lvl <= 1:
                _add(L, t0, bass(hz(broot), BEAT * 1.8, 0.9))
                _add(L, t0 + swing(2.5), bass(hz(broot), BEAT * 1.2, 0.7))
            else:
                for beat, dur, v, oct_ in ((0, 1.2, 0.95, 0), (1.5, 0.5, 0.7, 0), (2.5, 0.9, 0.8, 0), (3.5, 0.4, 0.6, 12)):
                    _add(L, t0 + swing(beat), bass(hz(broot + oct_), BEAT * dur, v))
        # melody (hook), sparse in calm
        hook = HOOK[bar % 8]
        notes = hook if lvl > 0 else (hook[:2] if bar % 2 == 0 else [])
        if t0 < 4:
            notes = []
        for beat, m, d in notes:
            _add(L, t0 + swing(beat), piano(hz(m + (0 if lvl < 3 else 0)), BEAT * d, 0.8), 1.0, pan=0.18)
            if lvl == 2 and d >= 1:  # soft octave shimmer in the focus groove
                _add(L, t0 + swing(beat), piano(hz(m + 12), BEAT * d, 0.22), 1.0, pan=0.3)
        # focused groove: plucked 16th arp ostinato
        if lvl == 2:
            arp = [voic[0] + 12, voic[2] + 12, voic[1] + 12, voic[3] + 12]
            for i in range(16):
                if i % 4 == 3 and bar % 2:
                    continue
                _add(L, t0 + i * BEAT * 0.25 + (0.02 if i % 2 else 0), piano(hz(arp[i % 4]), 0.25, 0.22 + 0.06 * (i % 4 == 0)), 1.0, pan=0.35 if i % 2 else -0.3)
        # drums
        if lvl >= 1 and not (lvl == 3 and t0 > 150):
            for beat in (0, 2.5 if lvl >= 2 else 2.25):
                _add(L, t0 + swing(beat), kick(0.8 if beat == 0 else 0.6))
            if lvl == 2:
                _add(L, t0 + swing(1), kick(0.4)) if bar % 2 else None
            if lvl <= 2:
                for beat in (1, 3):
                    _add(L, t0 + swing(beat), snare(0.5) if lvl == 2 else rim(0.9))
            if lvl == 3 and t0 < 150:
                _add(L, t0 + swing(2), rim(0.6))
            step = 0.25 if lvl == 2 else 0.5
            for i in range(int(4 / step)):
                b = i * step
                if lvl == 3 and i % 2:
                    continue
                _add(L, t0 + swing(b), hat(0.5 if i % 2 == 0 else 0.3, open_=(lvl == 1 and abs(b - 3.5) < 1e-6)), 1.0, pan=0.25)
        elif lvl == 0 and t0 > 16:
            for i in range(8):
                _add(L, t0 + swing(i * 0.5), hat(0.22), 1.0, pan=0.25)
    # riser into the send moment and a closing chord
    for (a, b) in [(31.0, 34.0), (87.0, 88.0)]:
        t = _t(b - a)
        ns = sosfilt(butter(2, [800, 8000], 'bp', fs=SR, output='sos'), RNG.normal(0, 1, len(t)))
        _add(L, a, ns * (t / (b - a)) ** 2 * 0.12, 1.0)
    end = scenes[-1][2]
    for m in (48, 55, 59, 64, 72):
        _add(L, end - 6.2, epiano(hz(m), 5.0, 0.7), 1.0)
        _add(L, end - 6.2, pad(hz(m - 12), 5.5, 0.8), 1.0)
    # lo-fi colour: gentle lowpass + vinyl crackle + tape wow via light wobble
    sos = butter(2, 9000, 'lp', fs=SR, output='sos')
    L[:, 0] = sosfilt(sos, L[:, 0]); L[:, 1] = sosfilt(sos, L[:, 1])
    crack = np.zeros(n)
    idx = RNG.integers(0, n, int(total * 5))
    crack[idx] = RNG.normal(0, 1, len(idx)) * 0.5
    crack = sosfilt(butter(2, 3500, 'hp', fs=SR, output='sos'), crack)
    L += (crack * 0.012)[:, None]
    # fades
    nn = int(total * SR)
    L = L[:nn]
    fi = np.minimum(1, np.arange(nn) / (1.5 * SR))
    fo = np.minimum(1, (nn - np.arange(nn)) / (2.5 * SR))
    L *= (fi * fo)[:, None]
    return L


# ---- sfx ---------------------------------------------------------------------
def bell(f, dur=0.8, vel=1.0):
    t = _t(dur)
    s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.12) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.05))
    return s * np.exp(-t / (dur * 0.38)) * np.minimum(1, t / 0.003) * 0.35 * vel


def sfx(kind):
    if kind == 'chime':
        return [(0, bell(1319, .9, 1.0)), (0.09, bell(1760, 1.0, .8))]
    if kind == 'listen':
        return [(0, bell(660, .25, .8)), (0.07, bell(990, .35, .9))]
    if kind == 'tick':
        t = _t(0.05)
        return [(0, np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.008) * 0.55)]
    if kind == 'ding':
        return [(0, bell(1319, 1.2, 1.0)), (0, bell(1976, 1.2, .7))]
    if kind == 'pair':
        return [(i * 0.075, bell(f, 0.9, 0.9)) for i, f in enumerate((1047, 1319, 1568, 2093))]
    if kind == 'notify':
        return [(0, bell(1568, .5, .9)), (0.11, bell(2349, .9, .9))]
    if kind == 'alarm':
        return [(i * 0.28, bell(f, 1.4, .8)) for i, f in enumerate((784, 988, 1175, 1568))]
    if kind == 'kill':
        t = _t(0.35)
        return [(0, np.sin(2 * np.pi * 110 * t) * np.exp(-t / 0.09) * 0.8), (0.02, bell(880, .5, .7))]
    if kind == 'whoosh':
        t = _t(0.7)
        ns = sosfilt(butter(2, [300, 5000], 'bp', fs=SR, output='sos'), RNG.normal(0, 1, len(t)))
        return [(0, ns * np.sin(np.pi * t / 0.7) ** 2 * 0.22)]
    if kind == 'render':
        return [(i * 0.12, bell(880 + i * 110, .3, .5)) for i in range(5)]
    raise KeyError(kind)


def make_sfx(total, events):
    S = np.zeros((int((total + 2) * SR), 2))
    for t0, kind, *rest in events:
        g = rest[0] if rest else 1.0
        for off, sig in sfx(kind):
            _add(S, t0 + off, sig, 0.9 * g)
    return S[: int(total * SR)]


# ---- tts + mix ---------------------------------------------------------------
def tts(root, work, text, voice='aai-kyla'):
    path = os.path.join(work, 'tts_%s.wav' % hashlib.sha1((voice + text).encode()).hexdigest()[:10])
    if os.path.exists(path) and os.path.getsize(path) > 4096:
        return path
    r = subprocess.run(['node', os.path.join(root, 'scripts', 'tts-vo-helper.mjs'), '--text', text, '--voice', voice, '--out', path],
                       cwd=root, capture_output=True, text=True, timeout=90)
    if r.returncode != 0 or not os.path.exists(path):
        raise SystemExit('TTS failed: ' + (r.stderr or r.stdout)[-300:])
    return path


def read_wav(path):
    with wave.open(path, 'rb') as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        raw = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64) / 32768
    if ch == 2:
        raw = raw.reshape(-1, 2).mean(1)
    if sr != SR:
        raw = np.interp(np.linspace(0, len(raw) - 1, int(len(raw) * SR / sr)), np.arange(len(raw)), raw)
    return raw


def smooth_env(x, atk=0.12, rel=0.45):
    a = np.exp(-1 / (atk * SR / 64)); r = np.exp(-1 / (rel * SR / 64))
    blocks = len(x) // 64
    m = np.abs(x[: blocks * 64]).reshape(blocks, 64).max(1)
    m = (m > 0.02).astype(float)
    out = np.zeros(blocks); y = 0.0
    for i in range(blocks):
        y = (a * y + (1 - a) * m[i]) if m[i] > y else (r * y + (1 - r) * m[i])
        out[i] = y
    return np.repeat(out, 64)[: len(x)] if len(x) >= blocks * 64 else out


def _to_wav(path, a):
    a = np.clip(a, -1, 1)
    pcm = (a * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


def mix(root, work, total, scenes, sfx_events, voice_clips, ff, out_wav):
    """voice_clips: list of (start_seconds, wav_path). Returns dict of stats."""
    nn = int(total * SR)
    music = make_music(total, scenes)
    music = music / (np.sqrt((music ** 2).mean()) + 1e-9) * 10 ** (-18 / 20)
    fx = make_sfx(total, sfx_events)
    voice = np.zeros(nn)
    for t0, p in voice_clips:
        v = read_wav(p)
        # RMS normalize each speaker line so wearer (aai-kyla) and OnQ (aai-titus) match level smoothly.
        rms = float(np.sqrt((v ** 2).mean()) + 1e-9)
        v = v * (0.20 / rms)
        pk = float(np.abs(v).max() + 1e-9)
        if pk > 0.92:
            v = v * (0.92 / pk)
        a = int(t0 * SR)
        if 0 <= a < nn:
            voice[a:a + len(v)] += v[: nn - a]
    duck = smooth_env(voice)
    gain = 1 - (1 - 10 ** (-9 / 20)) * duck  # music ~9 dB under dialogue
    mixed = music * gain[:, None] + fx * 0.72 + voice[:, None] * 1.05
    raw = os.path.join(work, 'mix_raw.wav')
    _to_wav(raw, mixed * 0.7)
    # two-pass loudnorm to -16 LUFS
    p1 = subprocess.run([ff, '-hide_banner', '-nostats', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
                        capture_output=True, text=True)
    j = json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', p1.stderr, re.S).group(0))
    af = ('loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true'
          % (j['input_i'], j['input_tp'], j['input_lra'], j['input_thresh'], j['target_offset']))
    subprocess.run([ff, '-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af', af, '-ar', '48000', out_wav], check=True)
    return {'measured_input_lufs': j['input_i']}
