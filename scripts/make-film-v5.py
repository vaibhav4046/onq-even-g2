"""OnQ Flagship Launch Film v5 ("Day in the Life with OnQ"):
Emerald cyber-anime scenes + real EvenHub Simulator 0.9.5 captures + AssemblyAI TTS-1 dual-voice + -16 LUFS score.
Reuses pre-rendered SVG->PNG anime plates in media/film-v3/work/layers/ and audio mixer in scripts/make-film-v3-audio.py.
Outputs 1920x1080 @ 30fps (165.0s / 2:45) to media/out/onq-film-v5-day-in-life.mp4.
"""
import importlib.util
import json
import math
import os
import subprocess
import sys
import time
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.getcwd()
FILM = os.path.join(ROOT, 'media', 'film-v3')
WORK = os.path.join(FILM, 'work')
LAY = os.path.join(WORK, 'layers')
CAPDIR = os.path.join(FILM, 'captures')
FPS = 30
DRAFT = '--draft' in sys.argv
S = 0.5 if DRAFT else 1.0
OW, OH = int(1920 * S), int(1080 * S)
C0 = (1152.0, 648.0)
GREEN = (126, 245, 52)  # BGR of #34f57e

SCENES = [
    ('wake', 0.0, 20.0),
    ('morning', 20.0, 45.0),
    ('coding', 45.0, 75.0),
    ('talk', 75.0, 102.0),
    ('telegram', 102.0, 130.0),
    ('recap', 130.0, 148.0),
    ('recap_end', 148.0, 165.0),
]

SLOTS = [
    'computer', 'card', 'draft', 'ring', 'done',
    'telegram', 'coding', 'summary', 'pr_gate',
    'conflict', 'video', 'career', 'recap', 'killswitch',
]

VOICE_WEARER = 'aai-kyla'
VOICE_ONQ = 'aai-titus'

# Carefully timed non-overlapping narration spanning all 7 Day-in-the-Life acts (165.0s total)
CAPTIONS = [
    (1.2, VOICE_ONQ, '08:00 AM · Put on camera-free Even G2. Instant PC auto-sync.', 'Eight AM. You already own a computer running your AI tools.'),
    (8.0, VOICE_ONQ, 'OnQ turns your PC into the AI brain, and Even G2 into a quiet optical window.', 'OnQ turns your PC into the brain, and Even G2 into a quiet window you wear all day.'),
    (14.6, VOICE_ONQ, 'OnQ: "PC host synced. Ollama Qwen3 and OpenBot ready at zero API cost."', 'P C host synced. Ollama Qwen three and OpenBot ready at zero cost.'),
    (20.6, VOICE_WEARER, '08:15 AM · Wearer: "Show my morning brief, and mark Q4 deck review done."', 'Eight fifteen. Show my morning brief, and mark Q4 deck review done.'),
    (27.2, VOICE_ONQ, 'OnQ: "Notion task staged Default-NO. Tap YES for the 2-second undo ring."', 'Notion task staged Default-NO. Tap yes for the two-second undo ring, then done with a receipt.'),
    (36.5, VOICE_ONQ, 'OnQ: "Confirmed. Notion checked off; morning schedule updated cleanly."', 'Confirmed. Notion checked off and morning schedule updated cleanly.'),
    (45.8, VOICE_WEARER, '10:30 AM · Wearer: "OnQ, run software crew and prep the PR for master."', 'Ten thirty, away from the desk. OnQ, run software crew and prep the P R for master.'),
    (53.2, VOICE_ONQ, 'OnQ: "530 tests pass on your local PC. Diff summarized. L5 blocks force push."', 'Five hundred thirty tests pass on your local P C. Diff summarized, L5 blocks force push.'),
    (63.2, VOICE_ONQ, 'OnQ: "PR gate staged Default-NO. Approve once on glasses or Telegram."', 'P R gate staged Default-NO. Approve once on glasses or Telegram.'),
    (75.8, VOICE_WEARER, '13:48 PM · Wearer: "Move VC sync to 14:45 and reply to Priya."', 'One forty eight, walking into V C sync. Move sync to two forty five.'),
    (82.0, VOICE_ONQ, 'OnQ: "Blocked in 31ms: HTTP 409 busy slot. Zero LLM calls; 15:45 is free."', 'Blocked in thirty one milliseconds. H T T P 409 conflict lock; fifteen forty five is free.'),
    (90.5, VOICE_ONQ, 'OnQ: "Meeting Scribe runs live in RAM, speaking to paired earbuds only."', 'Meeting Scribe runs live in memory, speaking only to paired earbuds because G2 has no speaker.'),
    (102.8, VOICE_WEARER, '16:00 PM · Wearer: "Over remote tunnel: run career pack for AI Engineer roles."', 'Four PM over encrypted tunnel. Run career pack for AI Engineer roles.'),
    (111.0, VOICE_ONQ, 'OnQ: "Three matching roles logged to Notion. Recruiter draft verified by Code-Guard."', 'Three roles logged to Notion tracker. Recruiter draft verified by Code-Guard.'),
    (120.5, VOICE_ONQ, 'OnQ: "Human-in-the-loop gate: zero blind spam until you tap YES."', 'Human-in-the-loop gate: zero blind spam until you tap yes.'),
    (130.6, VOICE_ONQ, '18:30 PM · Evening Recap & Telegram Kill Switch halts background routines (HTTP 423).', 'Six thirty PM. Evening recap and one-tap Telegram Kill Switch lock everything cleanly.'),
    (141.5, VOICE_ONQ, 'OnQ: "Every write audited, reversible, and kept under your control."', 'Every write audited, reversible, and kept under your control.'),
    (150.0, VOICE_ONQ, 'OnQ. Your PC AI brain on Even G2 — Sim-Verified and ready to ship.', 'OnQ. Your P C AI brain on Even G2. Simulator verified, private, and ready to ship.'),
]

TITLE = (
    'OnQ.',
    'Your PC AI brain, on Even G2.',
    '530 Tests · 17 Sim PNGs · 32/32 Eval · 11/11 Geometry · 10/10 Security · $7/mo Pro · Sim-Verified',
    'vaibhav4046.github.io/onq-even-g2/demo/ · github.com/vaibhav4046/onq-even-g2',
)


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, k):
    return a + (b - a) * k


def _shots():
    R = 'room'
    return [
        # Act 1: 08:00 AM · Put On G2, Instant PC Auto-Sync (0.0 -> 20.0s)
        (R, 5.5, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-4), cam=((1152, 700, 1.0), (1160, 690, 1.15)), fade=1.0, vignette=0.55,
                      keys=[(0, 'sleep', 0, 0), (3.5, 'neutral', 0, 0), (4.8, 'neutral', 0, -1)], sfx=[(3.4, 'alarm')], motes=True)),
        ('night', 5.5, dict(sfx=[(0.2, 'whoosh')])),
        (R, 3.0, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-4), cam=((1160, 720, 1.25), (1140, 640, 1.6)), fade=0.35,
                      keys=[(0, 'neutral', 0, 0), (0.5, 'neutral', 1, 0), (1.4, 'smile', 1, 0)], flash=0.5, glow=[(1.0, 3.0, 0.8)], motes=True)),
        ('lens', 6.0, dict(slot='computer', bg='desk', toast='ACT 1 · PC AUTO-SYNC · OLLAMA + OPENBOT READY ($0)', cam=((1300, 560, 1.0), (1300, 560, 1.05)), iris=(1000, 380), sfx=[(0.4, 'chime'), (1.0, 'pair')])),

        # Act 2: 08:15 AM · Morning Brief & One-Tap To-Do Completion (20.0 -> 45.0s)
        (R, 4.0, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-3), cam=((1150, 690, 1.2), (1150, 690, 1.16)), fade=0.4,
                      keys=[(0, 'focused', 1, 0)], talk=[(0.6, 3.2)], glow=[(0, 4.0, 0.5)], sfx=[(0.4, 'listen')], wave=(0.6, 3.2))),
        ('lens', 5.5, dict(slot='card', bg='bedroom', toast='ACT 2 · 08:15 MORNING BRIEF · CAL + MAIL + NOTION', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 5.5, dict(slot='draft', bg='bedroom', toast='VOICE: "OnQ, mark Q4 deck review done" (DEFAULT-NO)', cam=((1500, 520, 1.04), (1500, 520, 1.09)), iris=None, sfx=[(0.4, 'chime')])),
        ('lens', 5.0, dict(slot='ring', bg='bedroom', toast='2.0s 4-BIT GRAY4 UNDO RING ARMED', cam=((1500, 520, 1.06), (1500, 520, 1.11)), iris=(1000, 380), sfx=[(0.4, 'tick'), (0.9, 'tick'), (1.4, 'tick'), (1.9, 'tick')])),
        ('lens', 5.0, dict(slot='done', bg='bedroom', toast='RECEIPT COMMITTED · NOTION TASK CHECKED OFF', cam=((1500, 520, 1.08), (1500, 520, 1.12)), iris=None, sfx=[(0.3, 'ding')])),

        # Act 3: 10:30 AM · Coding From Glasses & Extensive PR Gate (45.0 -> 75.0s)
        (R, 4.5, dict(bg='desk', char=dict(x=900, y=640, s=1.15, rot=-2), cam=((1152, 600, 1.0), (1100, 590, 1.08)), fade=0.45,
                      keys=[(0, 'focused', 1, 1)], talk=[(0.7, 3.4)], glow=[(0, 4.5, 0.5)], sfx=[(0.5, 'listen')], wave=(0.7, 3.4), motes=True)),
        ('screen', 6.5, dict(state='term', sfx=[(0.2, 'whoosh')])),
        ('lens', 6.5, dict(slot='pr_gate', bg='desk', toast='ACT 3 · CODING PR GATE · L5 NO FORCE PUSH', cam=((1300, 560, 1.0), (1300, 560, 1.05)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 6.5, dict(slot='summary', bg='desk', toast='L4 SOFTWARE CREW · VERIFIED ON LOCAL PC', cam=((1300, 560, 1.03), (1300, 560, 1.08)), iris=None, sfx=[(0.4, 'chime')])),
        ('lens', 6.0, dict(slot='ring', bg='desk', toast='TG @onq_g2_copilot_bot · [APPROVE ONCE] READY', cam=((1300, 560, 1.05), (1300, 560, 1.1)), iris=None, sfx=[(0.4, 'tick'), (1.0, 'ding')])),

        # Act 4: 13:48 PM · 90s Corridor, 31ms 409 Conflict Lock & Meeting Scribe (75.0 -> 102.0s)
        (R, 4.5, dict(bg='street', walk=True, k=0.14, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.0), (1152, 640, 1.07)), fade=0.45, strt=0.55,
                      keys=[(0, 'neutral', 1, 0), (1.0, 'focused', 1, 0)], sfx=[(0.8, 'notify')], glow=[(0.8, 4.5, 0.7)], talk=[(1.0, 3.2)], wave=(1.0, 3.2))),
        ('lens', 7.5, dict(slot='conflict', bg='street', toast='ACT 4 · 31ms HTTP 409 CONFLICT LOCK · 0 LLM CALLS', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'kill')])),
        ('screen', 6.5, dict(state='avatar', sfx=[(0.2, 'whoosh'), (0.8, 'chime')])),
        ('lens', 8.5, dict(slot='video', bg='street', toast='MEETING SCRIBE · RAM-ONLY · EARBUDS TTS-1 AUDIO', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'chime')])),

        # Act 5: 16:00 PM · Remote Tunnel + Automated Job Research & Career Pack (102.0 -> 130.0s)
        (R, 4.5, dict(bg='street', walk=True, k=0.52, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.0), (1152, 648, 1.08)), fade=0.45,
                      keys=[(0, 'focused', 1, 0)], talk=[(0.6, 3.5)], glow=[(0, 4.5, 0.55)], sfx=[(0.5, 'listen')], wave=(0.6, 3.5))),
        ('screen', 7.5, dict(state='career_ui', sfx=[(0.2, 'whoosh'), (0.9, 'notify')])),
        ('lens', 8.5, dict(slot='career', bg='street', toast='ACT 5 · CAREER PACK · NOTION TRACKER + GMAIL DRAFT', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 7.5, dict(slot='ring', bg='street', toast='HUMAN GATE · ZERO BLIND SPAM · TAP YES TO QUEUE', cam=((1500, 520, 1.04), (1500, 520, 1.09)), iris=None, sfx=[(0.4, 'tick'), (1.0, 'ding')])),

        # Act 6: 18:30 PM · Evening Recap, Telegram Control & Kill Switch (130.0 -> 148.0s)
        ('screen', 6.0, dict(state='telegram_ui', sfx=[(0.2, 'whoosh'), (0.8, 'notify')])),
        ('lens', 6.0, dict(slot='recap', bg='balcony', toast='ACT 6 · 18:30 EVENING RECAP · ALL WRITES AUDITED', cam=((1500, 520, 1.0), (1500, 520, 1.05)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 6.0, dict(slot='killswitch', bg='balcony', toast='GLOBAL KILL SWITCH · HTTP 423 PAUSES ALL AGENTS', cam=((1500, 520, 1.02), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'kill')])),

        # Act 7: Verified Proof Lockup (148.0 -> 165.0s)
        (R, 5.0, dict(bg='balcony', char=dict(x=1060, y=700, s=1.15, rot=0), cam=((1152, 670, 1.0), (1120, 650, 1.1)), fade=0.55,
                      keys=[(0, 'neutral', 1, 0), (2.2, 'smile', 1, 0)], motes=True)),
        ('title', 12.0, dict(bg='balcony', fade=0.6)),
    ]


SHOTS = []
_t0 = 0.0
for kind, dur, p in _shots():
    SHOTS.append(dict(kind=kind, t0=_t0, t1=_t0 + dur, dur=dur, **p))
    _t0 += dur
TOTAL = _t0
NFRAMES = int(round(TOTAL * FPS))

_cache = {}
MAN = None
BGR_TINT = {
    'bedroom': (0.98, 1.04, 0.94),
    'street': (0.98, 1.04, 0.94),
    'desk': (0.96, 1.04, 0.94),
    'balcony': (0.98, 1.04, 0.94),
}


def manifest():
    global MAN
    if MAN is None:
        MAN = json.load(open(os.path.join(LAY, 'manifest.json')))
    return MAN


def load(name, tint=None, scale=None):
    key = (name, tint, scale)
    if key in _cache:
        return _cache[key]
    im = cv2.imread(os.path.join(LAY, name + '.png'), cv2.IMREAD_UNCHANGED)
    if im is None:
        raise FileNotFoundError(name)
    if im.shape[2] == 3:
        im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
    sc = S if scale is None else scale
    if sc != 1.0:
        im = cv2.resize(im, (max(1, int(im.shape[1] * sc)), max(1, int(im.shape[0] * sc))), interpolation=cv2.INTER_AREA)
    im = im.astype(np.float32)
    a = im[..., 3:4] / 255.0
    im[..., :3] *= a
    if tint:
        im[..., :3] *= np.array(tint, np.float32)
    im = np.clip(im, 0, 255).astype(np.uint8)
    if len(_cache) > 140:
        for k in list(_cache)[:40]:
            _cache.pop(k)
    _cache[key] = im
    return im


def over(dst, src, opacity=1.0):
    if opacity <= 0:
        return
    a = src[..., 3]
    s = src[..., :3]
    if opacity < 1.0:
        a = (a.astype(np.uint16) * int(round(opacity * 256)) >> 8).astype(np.uint8)
        s = cv2.multiply(s, (opacity, opacity, opacity, 1.0)) if opacity < 0.999 else s
    inv = 255 - a
    inv3 = cv2.merge([inv, inv, inv])
    bg_part = cv2.multiply(dst, inv3, scale=1.0 / 255.0)
    cv2.add(bg_part, s, dst=dst)


def add(dst, src, k=1.0):
    s = src[..., :3] if src.shape[2] == 4 else src
    if k != 1.0:
        s = (s.astype(np.float32) * k).astype(np.uint8)
    cv2.add(dst, s, dst=dst)


def warp(img, M):
    return cv2.warpAffine(img, M, (OW, OH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def layer_M(cx, cy, z):
    return np.array([[z, 0, (-cx * z + 960) * S], [0, z, (-cy * z + 540) * S]], np.float32)


def eff(cam, p):
    return (C0[0] + (cam[0] - C0[0]) * p, C0[1] + (cam[1] - C0[1]) * p, 1 + (cam[2] - 1) * p)


def camera(shot, t):
    a, b = shot['cam']
    k = ease(t / shot['dur'])
    cx, cy, z = (lerp(a[i], b[i], k) for i in range(3))
    cx += 3.5 * math.sin(0.7 * t + shot['t0']) + 2 * math.sin(1.9 * t)
    cy += 3.0 * math.sin(0.55 * t + 1.0) + 1.5 * math.sin(1.7 * t + 2)
    return cx, cy, z


FX_K = {'bedroom': 0.38, 'desk': 0.38, 'balcony': 0.7}
STACK = {
    'bedroom': [('bedroom_back', 0.5, 'o'), ('bedroom_mid', 0.8, 'o'), 'CHAR', ('bedroom_front', 1.12, 'o'), ('bedroom_fx', 0.9, 'a')],
    'desk': [('desk_back', 0.5, 'o'), 'CHAR', ('desk_front', 1.1, 'o'), ('desk_fx', 0.9, 'a')],
    'balcony': [('balcony_back', 0.35, 'o'), ('balcony_mid', 0.7, 'o'), 'CHAR', ('balcony_front', 1.15, 'o'), ('balcony_fx', 0.9, 'a')],
    'street': [('street_far', 0.04, 'o'), ('street_mid', 0.5, 'o'), ('street_near', 1.0, 'o'), 'CHAR', ('street_fg', 1.9, 'o')],
}


def draw_plates(dst, bg, cam, t, shot, with_char, char_fn=None, mid_override=None):
    tint = BGR_TINT[bg]
    walk = shot.get('walk', False)
    for item in STACK[bg]:
        if item == 'CHAR':
            if with_char and char_fn:
                char_fn(dst)
            continue
        name, p, mode = item
        if mid_override and name == 'bedroom_mid':
            name = mid_override
        img = load(name, tint if mode == 'o' else None)
        if bg == 'street':
            Wp = img.shape[1] / S
            v = shot.get('scroll_v', 150 if walk else 0)
            travel = v * p * shot['dur']
            k = shot.get('k', 0.5)
            start = 960 + travel + k * max(0, Wp - 1920 - travel)
            cx = min(max(start - v * p * t, 960), Wp - 960)
            cy, z = C0[1] + (cam[1] - C0[1]) * min(p, 1), 1 + (cam[2] - 1) * min(p, 1.2)
        else:
            cx, cy, z = eff(cam, p)
        w = warp(img, layer_M(cx, cy, z))
        if bg == 'street' and name == 'street_fg':
            w = cv2.GaussianBlur(w, (0, 0), 6 * S)
        if mode == 'o':
            over(dst, w)
        else:
            add(dst, w, FX_K.get(bg, 0.5))


def pick_key(keys, t):
    cur = keys[0]
    for k in keys:
        if k[0] <= t:
            cur = k
    return cur


def in_win(ws, t):
    return any(a <= t < b for a, b in (ws or []))


def head_name(expr, blink, talk, g, look):
    if expr == 'sleep':
        blink = True
    return f"h_{expr}_{'b' if blink else 'o'}_{'o' if talk else 'c'}_g{g}_l{look}"


def spr_M(ax_s, ay_s, wx, wy, z, rot, s, cam_c):
    cx, cy, zz = cam_c
    sx, sy = ((wx - cx) * zz + 960) * S, ((wy - cy) * zz + 540) * S
    k = s * zz * S
    r = math.radians(rot)
    c, sn = math.cos(r) * k, math.sin(r) * k
    return np.array([[c, -sn, sx - (c * ax_s - sn * ay_s)], [sn, c, sy - (sn * ax_s + c * ay_s)]], np.float32)


def draw_char(dst, shot, t, cam):
    cfg = shot['char']
    bg = shot['bg']
    tint = BGR_TINT[bg]
    walk = shot.get('walk', False)
    expr_k = pick_key(shot['keys'], t)
    expr, g, look = expr_k[1], expr_k[2], expr_k[3]
    blink = expr != 'sleep' and ((t * 1000 + shot['t0'] * 377) % 3300) < 130
    talk = in_win(shot.get('talk'), t) and int(t * 7) % 2 == 0
    man = manifest()
    bodyi = load('body', tint, 1.0)
    hd = load(head_name(expr, blink, talk, g, look), tint, 1.0)
    pc = 0.0 if bg == 'street' else 1.0
    cam_c = eff(cam, pc) if pc else (C0[0], C0[1], 1 + (cam[2] - 1) * 0.6)
    bob = -abs(math.sin(2 * math.pi * 1.9 * t)) * 13 + 6 if walk else 0.0
    sway = 1.6 * math.sin(2 * math.pi * 1.9 * t) if walk else 0.0
    wx, wy = cfg['x'], cfg['y'] + bob + 1.8 * math.sin(2 * math.pi * t / 4.0)
    s = cfg['s']
    rot = cfg['rot'] + sway
    hrot = rot + 1.4 * math.sin(0.9 * t + shot['t0']) + (-2.0 * look) + (1.5 * math.sin(2 * math.pi * 1.9 * t + 1) if walk else 0)
    if expr == 'sleep':
        hrot += 3
    bi = spr_M(man['body']['ax'], man['body']['ay'], wx, wy, 1, rot, s * 1.14, cam_c)
    hi = spr_M(man['head']['ax'], man['head']['ay'], wx, wy + 2, 1, hrot, s, cam_c)
    over(dst, warp(bodyi, bi))
    over(dst, warp(hd, hi))
    glow = sum(v for a, b, v in shot.get('glow', []) if a <= t < b) if shot.get('glow') else 0
    flash = shot.get('flash')
    fl = (1 - abs(t - flash) / 0.35) if (flash is not None and abs(t - flash) < 0.35) else 0.0
    if glow > 0 or fl > 0:
        lx, ly = man['head']['lens']
        pt = hi @ np.array([lx, ly, 1.0], np.float32)
        layer = np.zeros((OH, OW, 3), np.uint8)
        pulse = 0.75 + 0.25 * math.sin(t * 5)
        cv2.ellipse(layer, (int(pt[0]), int(pt[1])), (int(70 * s * cam_c[2] * S), int(58 * s * cam_c[2] * S)), 0, 0, 360, tuple(int(c * glow * pulse * 0.42) for c in GREEN), -1)
        layer = cv2.GaussianBlur(layer, (0, 0), 14 * S * s)
        if fl > 0:
            cv2.circle(layer, (int(pt[0]), int(pt[1])), int(34 * S * s * cam_c[2] * (1 + fl)), (int(255 * fl),) * 3, -1)
            layer = cv2.GaussianBlur(layer, (0, 0), 10 * S)
        add(dst, layer)
        return pt
    return None


_post = {}


def post_masks(bg):
    if bg in _post:
        return _post[bg]
    yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
    r = np.sqrt(((xx - OW / 2) / (OW * 0.62)) ** 2 + ((yy - OH / 2) / (OH * 0.68)) ** 2)
    vig = np.clip(1.08 - 0.42 * r ** 2.2, 0.45, 1.05)
    m = np.clip(np.stack([vig] * 3, -1) * 128, 0, 255).astype(np.uint8)
    _post[bg] = m
    return m


def noise_bank():
    if 'noise' not in _post:
        rng = np.random.default_rng(3)
        _post['noise'] = [np.clip(rng.normal(0, 4.5, (OH, OW)), 0, 12).astype(np.uint8) for _ in range(6)]
    return _post['noise']


def post(dst, i, bg='bedroom', bloom=0.35, grain=1.0, vignette=True):
    small = cv2.resize(dst, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA)
    hi = cv2.GaussianBlur(cv2.subtract(small, np.full_like(small, 212)), (0, 0), 8)
    up = cv2.resize(hi, (OW, OH), interpolation=cv2.INTER_LINEAR)
    cv2.addWeighted(dst, 1.0, up, bloom * 1.15, 0, dst=dst)
    if vignette:
        dst[:] = cv2.multiply(dst, post_masks(bg), scale=1 / 128.0)
    if grain:
        nb = noise_bank()[i % 6]
        n = np.roll(nb, ((i * 91) % OH, (i * 37) % OW), (0, 1))
        cv2.add(dst, cv2.merge([n, n, n]), dst=dst)


def motes(dst, t, bg):
    rng = np.random.default_rng(5)
    layer = np.zeros((OH, OW, 3), np.uint8)
    col = (170, 215, 255) if bg != 'balcony' else (150, 230, 255)
    for k in range(34):
        x0, y0 = rng.uniform(0, OW), rng.uniform(0, OH)
        vx, vy = rng.uniform(-6, 6) * S, rng.uniform(-14, -3) * S
        x = (x0 + vx * t * 3 + 18 * S * math.sin(t * 0.7 + k)) % OW
        y = (y0 + vy * t * 3) % OH
        r = rng.uniform(1.2, 3.6) * S
        a = 0.35 + 0.65 * abs(math.sin(t * 0.9 + k * 1.7))
        cv2.circle(layer, (int(x), int(y)), max(1, int(r)), tuple(int(c * a) for c in col), -1, cv2.LINE_AA)
    add(dst, cv2.GaussianBlur(layer, (0, 0), 1.3 * S), 0.9)


def wave_bars(dst, t, a, b, pt):
    if not (a <= t < b):
        return
    layer = np.zeros((OH, OW, 3), np.uint8)
    x0, y0 = int(1320 * S), int(330 * S)
    ramp = min(1, (t - a) / 0.25, (b - t) / 0.25)
    for i in range(9):
        h = (8 + 36 * abs(math.sin(t * 9 + i * 1.3) * math.sin(t * 3.1 + i))) * S * ramp
        x = x0 + int(i * 15 * S)
        cv2.line(layer, (x, int(y0 - h)), (x, int(y0 + h)), GREEN, max(2, int(6 * S)), cv2.LINE_AA)
    add(dst, cv2.GaussianBlur(layer, (0, 0), 7 * S), 0.9)
    add(dst, layer, 0.9)


def font(name, size):
    path = {'ui': 'segoeuisb.ttf', 'uib': 'segoeuib.ttf', 'mono': 'consola.ttf', 'monob': 'consolab.ttf', 'serif': 'georgiab.ttf', 'bah': 'bahnschrift.ttf', 'light': 'segoeuisl.ttf'}[name]
    for d in ('C:/Windows/Fonts/',):
        p = d + path
        if os.path.exists(p):
            return ImageFont.truetype(p, max(8, int(size * S)))
        p = d + 'segoeuib.ttf'
    return ImageFont.truetype(p, int(size * S))


def text_rgba(txt, fnt, color=(255, 255, 255), shadow=True, pad=22, bg=(14, 18, 34, 150), radius=24):
    tmp = Image.new('RGBA', (10, 10))
    d = ImageDraw.Draw(tmp)
    box = d.textbbox((0, 0), txt, font=fnt)
    w, h = box[2] - box[0], box[3] - box[1]
    pw, ph = int(pad * S * 1.35), int(pad * S * 0.65)
    im = Image.new('RGBA', (w + 2 * pw, h + 2 * ph + int(8 * S)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=int(radius * S), fill=bg)
    if shadow:
        d.text((pw - box[0] + 2 * S, ph - box[1] + 3 * S), txt, font=fnt, fill=(0, 0, 0, 170))
    d.text((pw - box[0], ph - box[1]), txt, font=fnt, fill=color + (255,))
    return im


def pil_to_pm(im):
    a = np.array(im).astype(np.float32)
    bgra = np.dstack([a[..., 2], a[..., 1], a[..., 0], a[..., 3]])
    bgra[..., :3] *= bgra[..., 3:4] / 255.0
    return bgra.astype(np.uint8)


_capcache = {}


def caption_layer(i):
    if i not in _capcache:
        _, voice, sub_txt, _ = CAPTIONS[i]
        col = (134, 255, 175) if voice == VOICE_ONQ else (238, 252, 242)
        bg = (6, 26, 15, 200) if voice == VOICE_ONQ else (10, 20, 16, 190)
        sz = 40 if len(sub_txt) <= 78 else 35
        _capcache[i] = pil_to_pm(text_rgba(sub_txt, font('ui', sz), color=col, bg=bg))
    return _capcache[i]


def draw_caption(dst, t, clip_len, low=False):
    for i, (t0, _, _, _) in enumerate(CAPTIONS):
        d = clip_len.get(i, 4.2)
        t1 = t0 + d + 0.4
        if t0 - 0.15 <= t <= t1 + 0.3:
            a = min(ease((t - (t0 - 0.15)) / 0.3), ease((t1 + 0.3 - t) / 0.3))
            im = caption_layer(i)
            h, w = im.shape[:2]
            x = max(0, (OW - w) // 2)
            y = max(0, int(OH - (40 if low else 120) * S - h + (1 - a) * 14 * S))
            w_fit = min(w, OW - x)
            h_fit = min(h, OH - y)
            roi = dst[y:y + h_fit, x:x + w_fit]
            tmp = im[:h_fit, :w_fit]
            if a < 1:
                tmp = (tmp.astype(np.float32) * a).astype(np.uint8)
            over(roi, tmp)
            dst[y:y + h_fit, x:x + w_fit] = roi
            return


def read_captures():
    return json.load(open(os.path.join(FILM, 'captures.json')))['slots']


def get_capture(slot):
    key = ('cap', slot)
    if key not in _cache:
        rel = read_captures()[slot]
        p = rel if os.path.isabs(rel) else os.path.join(FILM, rel)
        im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
        if im is None:
            im = np.zeros((288, 576, 3), np.uint8)
        elif im.ndim == 3 and im.shape[2] == 4:
            a = im[..., 3:4].astype(np.float32) / 255.0
            im = (im[..., :3].astype(np.float32) * a).astype(np.uint8)
        h, w = im.shape[:2]
        sc = min(576 / w, 288 / h)
        im = cv2.resize(im, (max(1, int(w * sc)), max(1, int(h * sc))), interpolation=cv2.INTER_AREA if sc < 1 else cv2.INTER_CUBIC)
        canvas = np.zeros((288, 576, 3), np.uint8)
        y, x = (288 - im.shape[0]) // 2, (576 - im.shape[1]) // 2
        canvas[y:y + im.shape[0], x:x + im.shape[1]] = im
        _cache[key] = canvas
    return _cache[key]


def hud_layer(slot):
    key = ('hud', slot, S)
    if key not in _cache:
        cap = get_capture(slot)
        lum = cv2.cvtColor(cap, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        lum = np.maximum(lum, cap.max(2).astype(np.float32) / 255.0 * 0.92)
        k = 2.6 * S
        big = np.clip(cv2.resize(lum, (int(576 * k), int(288 * k)), interpolation=cv2.INTER_CUBIC), 0, 1)
        rows = np.arange(big.shape[0])
        big *= (1 - 0.14 * ((rows // max(1, int(round(2 * S)))) % 2))[:, None]
        g = np.dstack([big * GREEN[0], big * GREEN[1], big * GREEN[2]]).astype(np.uint8)
        fr = np.zeros_like(g)
        hh, ww = g.shape[:2]
        L = int(46 * S)
        for (x, y, dx, dy) in ((0, 0, 1, 1), (ww - 1, 0, -1, 1), (0, hh - 1, 1, -1), (ww - 1, hh - 1, -1, -1)):
            cv2.line(fr, (x, y), (x + dx * L, y), GREEN, max(1, int(3 * S)))
            cv2.line(fr, (x, y), (x, y + dy * L), GREEN, max(1, int(3 * S)))
        _cache[key] = cv2.add(g, (fr.astype(np.float32) * 0.55).astype(np.uint8))
    return _cache[key]


def lens_overlay():
    key = ('lensov', S)
    if key not in _cache:
        yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
        cx, cy = OW / 2, OH * 0.5
        rx, ry = OW * 0.50, OH * 0.52
        d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
        outside = np.clip((d - 0.93) / 0.07, 0, 1)
        a = np.clip(outside * 255, 0, 255) * 0.97
        inner = np.clip((d - 0.55) / 0.4, 0, 1) ** 1.6 * 0.55 * 255
        a = np.maximum(a, inner * (1 - outside))
        col = np.array([36, 24, 22], np.float32)
        ov = np.zeros((OH, OW, 4), np.float32)
        ov[..., :3] = col * (a[..., None] / 255.0)
        ov[..., 3] = a
        rim = np.exp(-((d - 0.935) / 0.012) ** 2)
        ang = np.arctan2(yy - cy, xx - cx)
        arc = np.clip(np.cos(ang + 2.3), 0, 1) ** 4
        ov[..., :3] += (rim * arc * 255 * 0.9)[..., None] * np.array([1.0, 0.96, 0.9], np.float32)
        ov[..., 3] = np.maximum(ov[..., 3], rim * arc * 255 * 0.9)
        glare = np.exp(-(((xx - cx) * 0.6 + (yy - cy) * 0.8 + 380 * S) / (60 * S)) ** 2) * np.clip(1 - d, 0, 1) * 18
        _cache[key] = (np.clip(ov, 0, 255).astype(np.uint8), np.clip(glare, 0, 255).astype(np.uint8))
    return _cache[key]


def draw_lens(dst, shot, t, i):
    bg = shot['bg']
    cam = camera(shot, t)
    world = np.zeros((OH, OW, 3), np.uint8)
    draw_plates(world, bg, cam, 0.0, dict(shot, walk=False, scroll_v=0, k=0.6), with_char=False)
    sm = cv2.GaussianBlur(cv2.resize(world, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA), (0, 0), 4.0)
    bgb = (cv2.resize(sm, (OW, OH), interpolation=cv2.INTER_CUBIC).astype(np.float32) * 0.48).astype(np.uint8)
    hud = hud_layer(shot['slot'])
    hh, ww = hud.shape[:2]
    k = ease(t / 0.45)
    flick = 1.0 if t > 0.4 else (0.82 + 0.18 * math.sin(t * 75)) * k
    off = 6 * S * math.sin(t * 0.8)
    scale = 0.97 + 0.03 * k
    hudz = cv2.resize(hud, (int(ww * scale), int(hh * scale)), interpolation=cv2.INTER_LINEAR) if scale != 1 else hud
    h2, w2 = hudz.shape[:2]
    x, y = int(OW / 2 - w2 / 2 + 5 * S * math.sin(t * 0.5)), int(OH * 0.5 - h2 / 2 + off)
    layer = np.zeros((OH, OW, 3), np.uint8)
    layer[y:y + h2, x:x + w2] = (hudz.astype(np.float32) * flick).astype(np.uint8)

    toast = shot.get('toast')
    if toast and t > 0.35:
        ta = ease((t - 0.35) / 0.3)
        im_t = text_rgba(toast, font('mono', 22), color=(184, 255, 209), shadow=False, pad=12, bg=(10, 38, 22, 220), radius=10)
        pm_t = pil_to_pm(im_t)
        ph, pw = pm_t.shape[:2]
        tx_i = max(0, (OW - pw) // 2)
        ty_i = max(int(16 * S), y - ph - int(14 * S))
        pw_f = min(pw, OW - tx_i)
        ph_f = min(ph, OH - ty_i)
        roi = layer[ty_i:ty_i + ph_f, tx_i:tx_i + pw_f]
        over(roi, pm_t[:ph_f, :pw_f], ta)
        layer[ty_i:ty_i + ph_f, tx_i:tx_i + pw_f] = roi

    if t < 0.7:
        sy = int(y + h2 * (t / 0.7))
        cv2.rectangle(layer, (x, max(0, sy - int(2 * S))), (x + w2, sy + int(2 * S)), tuple(int(c * 0.7) for c in GREEN), -1)

    l_sm = cv2.resize(layer, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA)
    g1 = cv2.resize(cv2.GaussianBlur(l_sm, (0, 0), 2.5 * S), (OW, OH), interpolation=cv2.INTER_LINEAR)
    g2 = cv2.resize(cv2.GaussianBlur(l_sm, (0, 0), 8.5 * S), (OW, OH), interpolation=cv2.INTER_LINEAR)
    pane = np.zeros((OH // 4, OW // 4), np.float32)
    cv2.rectangle(pane, (max(0, (x - int(28 * S)) // 4), max(0, (y - int(28 * S)) // 4)),
                  (min(OW // 4 - 1, (x + w2 + int(28 * S)) // 4), min(OH // 4 - 1, (y + h2 + int(28 * S)) // 4)), 1.0, -1)
    pane = cv2.resize(cv2.GaussianBlur(pane, (0, 0), 5.5 * S), (OW, OH), interpolation=cv2.INTER_LINEAR) * 0.78 * k
    bgb = (bgb.astype(np.float32) * (1 - pane[..., None])).astype(np.uint8)
    cv2.addWeighted(bgb, 1.0, layer, 1.0, 0, dst=bgb)
    cv2.addWeighted(bgb, 1.0, g1, 0.28, 0, dst=bgb)
    cv2.addWeighted(bgb, 1.0, g2, 0.14, 0, dst=bgb)
    ov, glare = lens_overlay()
    over(bgb, ov)
    add(bgb, cv2.merge([glare] * 3), 0.75)

    # Honest minimal source badge top-right
    bkey = ('simbadge', S)
    if bkey not in _cache:
        _cache[bkey] = pil_to_pm(text_rgba('REAL SIMULATOR 0.9.5 · SANDBOX', font('mono', 19), color=(146, 224, 174), shadow=False, pad=10, bg=(8, 22, 14, 195), radius=8))
    bm = _cache[bkey]
    bh, bw = bm.shape[:2]
    bx, by = OW - bw - int(32 * S), int(24 * S)
    roi_b = bgb[by:by + bh, bx:bx + bw]
    over(roi_b, bm)
    bgb[by:by + bh, bx:bx + bw] = roi_b
    dst[:] = bgb


def screen_frame(shot, t):
    st = shot['state']
    dur = shot['dur']
    key = ('scrbg', S)
    if key not in _cache:
        w = cv2.warpAffine(load('desk_back', BGR_TINT['desk'], S), layer_M(1152, 700, 1.0), (OW, OH))
        bg = np.zeros((OH, OW, 3), np.uint8)
        bg[:] = (16, 28, 22)
        over(bg, w)
        small = cv2.GaussianBlur(cv2.resize(bg, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA), (0, 0), 5)
        _cache[key] = (cv2.resize(small, (OW, OH), interpolation=cv2.INTER_CUBIC) * 0.55).astype(np.uint8)
    frame = _cache[key].copy()
    z = lerp(1.0, 1.06, ease(t / dur))
    sw, sh = int(1500 * S * z), int(860 * S * z)
    img = Image.new('RGB', (sw, sh), (12, 18, 16))
    d = ImageDraw.Draw(img)
    px = lambda v: int(v * S * z)
    d.rectangle([0, 0, sw, px(46)], fill=(20, 32, 26))
    for i, c in enumerate(((255, 96, 92), (255, 189, 68), (52, 199, 89))):
        d.ellipse([px(22 + i * 26), px(15), px(36 + i * 26), px(29)], fill=c)
    d.text((px(630), px(9)), 'OnQ PC Host · Live Companion', font=font('ui', 22 * z), fill=(150, 195, 168))

    if st == 'term':
        d.text((px(70), px(74)), 'PC AI POWER SOURCE · CODING & PR GATE', font=font('uib', 36 * z), fill=(52, 245, 126))
        lines = [
            ('$ onq /code prep pr --host ollama:qwen3:1.7b', (210, 240, 220)),
            ('host     Ollama (local) · OmniRoute (295 models) · $0 API', (134, 220, 170)),
            ('tests    PASS  530/530 Vitest · 32/32 Eval · 0 TS errors', (52, 245, 126)),
            ('pr gate  branch master · diff verified -> Default-NO ready', (184, 255, 209)),
        ]
        fnt = font('mono', 31 * z)
        y = 148
        nch = int(t * 72)
        for txt, col in lines:
            if nch <= 0:
                break
            d.text((px(70), px(y)), txt[:nch], font=fnt, fill=col)
            nch -= len(txt) + 3
            y += 72
        d.text((px(70), px(468)), 'SUGGESTED PR GATES (HUMAN APPROVAL REQUIRED):', font=font('mono', 24 * z), fill=(134, 255, 175))
        chips = ['Approve Local Dry-Run PR', 'Approve via Telegram Bot', 'L5 Block Force Push']
        for ci, ch_lbl in enumerate(chips):
            cx0 = 70 + ci * 450
            sel_c = ci == 0 and t > 2.0
            d.rounded_rectangle([px(cx0), px(524), px(cx0 + 425), px(610)], radius=px(14),
                                fill=(16, 62, 36) if sel_c else (12, 28, 20),
                                outline=(52, 245, 126) if sel_c else (42, 92, 62), width=max(1, px(3 if sel_c else 2)))
            d.text((px(cx0 + 22), px(552)), '> ' + ch_lbl, font=font('mono', 24 * z), fill=(184, 255, 209) if sel_c else (150, 200, 170))
        d.text((px(70), px(688)), 'Verified by Auditor crew. Zero force push, zero secrets, Default-NO.', font=font('light', 28 * z), fill=(140, 195, 160))

    elif st == 'career_ui':
        d.text((px(70), px(74)), 'CAREER PACK · AUTOMATED JOB RESEARCH', font=font('uib', 34 * z), fill=(52, 245, 126))
        d.rounded_rectangle([px(1080), px(72), px(1425), px(120)], radius=px(16), fill=(12, 46, 28), outline=(52, 245, 126), width=max(1, px(2)))
        d.text((px(1105), px(82)), 'CODE-GUARD + NO SPAM', font=font('mono', 22 * z), fill=(134, 255, 175))
        roles = [
            ('1. Staff AI Systems Eng · Even Labs Track (94% FIT)', 'Smart eyewear + safety FSM + TypeScript · Added to Notion Tracker', True),
            ('2. Founding Applied AI Eng · Edge Copilot Co (92% FIT)', 'Local Ollama + Agentic harness + Voice STT · Outreach drafted', False),
            ('3. Wearable OS Engineer · Ambient Robotics (89% FIT)', 'Low-power HUD + zero-trust BLE gateway · Staged for review', False),
        ]
        for idx, (rt, rs, sel) in enumerate(roles):
            y0 = 158 + idx * 142
            d.rounded_rectangle([px(70), px(y0), px(1425), px(y0 + 118)], radius=px(16),
                                fill=(12, 40, 24) if sel else (10, 24, 18),
                                outline=(52, 245, 126) if sel else (26, 60, 42), width=max(1, px(3 if sel else 1)))
            d.text((px(102), px(y0 + 18)), rt, font=font('uib', 28 * z), fill=(134, 255, 175) if sel else (165, 205, 182))
            d.text((px(102), px(y0 + 66)), rs, font=font('mono', 23 * z), fill=(220, 245, 228) if sel else (125, 160, 140))
        d.rounded_rectangle([px(70), px(610), px(1425), px(775)], radius=px(16), fill=(8, 30, 18), outline=(134, 255, 175), width=max(1, px(3)))
        d.text((px(102), px(632)), 'STAGED GMAIL OUTREACH DRAFT (DEFAULT-NO · CODE-GUARD PASS)', font=font('mono', 24 * z), fill=(52, 245, 126))
        d.text((px(102), px(684)), '"Sharing my OnQ smart-glasses + agentic TS portfolio (94% match)."  [TAP YES ON G2]', font=font('ui', 25 * z), fill=(228, 252, 236))

    elif st == 'telegram_ui':
        d.text((px(80), px(82)), 'TELEGRAM COMMAND CENTRE · @onq_g2_copilot_bot (LIVE)', font=font('uib', 35 * z), fill=(52, 245, 126))
        d.rounded_rectangle([px(1100), px(78), px(1420), px(126)], radius=px(18), fill=(12, 46, 28), outline=(52, 245, 126), width=max(1, px(2)))
        d.text((px(1126), px(90)), 'OWNER DM GUARDED', font=font('mono', 22 * z), fill=(134, 255, 175))
        chats = [
            ('[WATCHED] Founders Group · 3 new', 'Investor asks: Share Q4 metrics + OnQ .ehpk', True),
            ('[L2 GATE] PR Push Approval (master) · PENDING', 'Inline buttons: [Approve Once]  [Reject]  [Kill Switch (Pause All)]', False),
            ('[MUTED] Public Lobby · Group Privacy Guard', 'Zero privileged commands allowed in group chats', False),
        ]
        for idx, (title_c, sub_c, sel) in enumerate(chats):
            y0 = 172 + idx * 145
            d.rounded_rectangle([px(80), px(y0), px(1420), px(y0 + 122)], radius=px(16),
                                fill=(12, 38, 24) if sel else (10, 22, 16),
                                outline=(52, 245, 126) if sel else (26, 60, 42), width=max(1, px(3 if sel else 1)))
            d.text((px(112), px(y0 + 20)), title_c, font=font('uib', 28 * z), fill=(134, 255, 175) if sel else (165, 200, 180))
            d.text((px(112), px(y0 + 68)), sub_c, font=font('mono', 24 * z), fill=(220, 245, 228) if sel else (120, 155, 138))
        d.rounded_rectangle([px(80), px(626), px(1420), px(790)], radius=px(16), fill=(8, 30, 18), outline=(134, 255, 175), width=max(1, px(3)))
        d.text((px(112), px(648)), 'GLOBAL KILL SWITCH · HTTP 423 LOCK', font=font('mono', 24 * z), fill=(52, 245, 126))
        d.text((px(112), px(698)), 'Tap [Kill Switch (Pause All)] in Telegram to halt L3/L4 crews + paired devices.', font=font('ui', 26 * z), fill=(228, 252, 236))

    elif st == 'avatar':
        d.text((px(70), px(82)), 'LIVE MEETING SCRIBE · ASSEMBLYAI STT-3.7 + TTS-1 (EARBUDS)', font=font('uib', 34 * z), fill=(52, 245, 126))
        cx_, cy_, r = px(320), px(460), px(176)
        d.ellipse([cx_ - r, cy_ - r, cx_ + r, cy_ + r], fill=(4, 18, 10), outline=(52, 245, 126), width=max(2, px(4)))
        d.polygon([
            (cx_ - px(108), cy_ + px(136)), (cx_ - px(74), cy_ + px(58)), (cx_ - px(34), cy_ + px(42)),
            (cx_ + px(34), cy_ + px(42)), (cx_ + px(74), cy_ + px(58)), (cx_ + px(108), cy_ + px(136)),
        ], fill=(10, 46, 23), outline=(52, 245, 126), width=max(2, px(3)))
        d.polygon([
            (cx_ - px(96), cy_ - px(4)), (cx_ - px(120), cy_ - px(46)), (cx_ - px(82), cy_ - px(62)),
            (cx_ - px(98), cy_ - px(108)), (cx_ - px(46), cy_ - px(94)), (cx_ - px(36), cy_ - px(136)),
            (cx_, cy_ - px(104)), (cx_ + px(28), cy_ - px(140)), (cx_ + px(44), cy_ - px(94)),
            (cx_ + px(96), cy_ - px(108)), (cx_ + px(80), cy_ - px(62)), (cx_ + px(118), cy_ - px(46)),
            (cx_ + px(96), cy_ - px(4)),
        ], fill=(6, 31, 16), outline=(52, 245, 126), width=max(2, px(3)))
        d.polygon([
            (cx_ - px(64), cy_ - px(44)), (cx_ + px(64), cy_ - px(44)), (cx_ + px(60), cy_ + px(18)),
            (cx_ + px(24), cy_ + px(56)), (cx_, cy_ + px(64)), (cx_ - px(24), cy_ + px(56)), (cx_ - px(60), cy_ + px(18)),
        ], fill=(13, 59, 30), outline=(52, 245, 126), width=max(2, px(3)))
        d.line([(cx_ - px(52), cy_ - px(24)), (cx_ - px(14), cy_ - px(16))], fill=(184, 255, 209), width=max(2, px(4)))
        d.line([(cx_ + px(52), cy_ - px(24)), (cx_ + px(14), cy_ - px(16))], fill=(184, 255, 209), width=max(2, px(4)))
        d.polygon([(cx_ - px(48), cy_ - px(10)), (cx_ - px(16), cy_ - px(6)), (cx_ - px(20), cy_ + px(8)), (cx_ - px(44), cy_ + px(6))], fill=(4, 18, 10), outline=(52, 245, 126), width=max(1, px(2)))
        d.polygon([(cx_ + px(48), cy_ - px(10)), (cx_ + px(16), cy_ - px(6)), (cx_ + px(20), cy_ + px(8)), (cx_ + px(44), cy_ + px(6))], fill=(4, 18, 10), outline=(52, 245, 126), width=max(1, px(2)))
        d.ellipse([cx_ - px(36), cy_ - px(7), cx_ - px(22), cy_ + px(7)], fill=(52, 245, 126))
        d.ellipse([cx_ + px(22), cy_ - px(7), cx_ + px(36), cy_ + px(7)], fill=(52, 245, 126))
        d.polygon([
            (cx_ - px(68), cy_ - px(28)), (cx_ - px(50), cy_ - px(64)), (cx_ - px(34), cy_ - px(30)),
            (cx_ - px(12), cy_ - px(68)), (cx_, cy_ - px(24)), (cx_ + px(14), cy_ - px(68)),
            (cx_ + px(34), cy_ - px(30)), (cx_ + px(50), cy_ - px(64)), (cx_ + px(68), cy_ - px(28)),
            (cx_ + px(56), cy_ - px(78)), (cx_, cy_ - px(94)), (cx_ - px(56), cy_ - px(78)),
        ], fill=(6, 31, 16), outline=(52, 245, 126), width=max(1, px(2)))
        mh = px(6 + 18 * abs(math.sin(t * 10)))
        d.rounded_rectangle([cx_ - px(22), cy_ + px(30) - mh // 2, cx_ + px(22), cy_ + px(30) + mh // 2], radius=px(8), fill=(4, 18, 10), outline=(134, 255, 175), width=max(1, px(2)))
        for bi in range(18):
            bh = px(18 + 72 * abs(math.sin(t * 7 + bi * 0.6)))
            bx = px(560 + bi * 46)
            d.rectangle([bx, px(660) - bh, bx + px(28), px(660)], fill=(52, 245, 126) if bi % 2 == 0 else (134, 255, 175))
        d.rounded_rectangle([px(560), px(220), px(1425), px(480)], radius=px(20), fill=(10, 34, 20), outline=(52, 245, 126), width=max(1, px(3)))
        d.text((px(600), px(256)), 'ONQ COMPANION VOICE · PAIRED EARBUDS', font=font('mono', 24 * z), fill=(52, 245, 126))
        d.text((px(600), px(316)), '"RAM-only diarization active. Zero audio saved."', font=font('ui', 32 * z), fill=(224, 252, 234))
        d.text((px(600), px(378)), 'Even G2 has no speaker · Voice routes to earbuds.', font=font('light', 26 * z), fill=(145, 205, 170))

    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    x0, y0 = (OW - sw) // 2, int(OH * 0.5 - sh / 2)
    bez = int(26 * S)
    cv2.rectangle(frame, (x0 - bez, y0 - bez), (x0 + sw + bez, y0 + sh + bez), (18, 36, 26), -1)
    glow_sm = cv2.GaussianBlur(cv2.rectangle(np.zeros((OH // 4, OW // 4, 3), np.uint8), (x0 // 4, y0 // 4), ((x0 + sw) // 4, (y0 + sh) // 4), (42, 160, 88), -1), (0, 0), max(1, int(12 * S)))
    cv2.addWeighted(frame, 1, cv2.resize(glow_sm, (OW, OH), interpolation=cv2.INTER_LINEAR), 0.24, 0, dst=frame)
    frame[y0:y0 + sh, x0:x0 + sw] = arr
    return frame


def draw_title(dst, shot, t):
    bgf = np.zeros((OH, OW, 3), np.uint8)
    draw_plates(bgf, 'balcony', (1120, 590, 1.2), 0, dict(shot, walk=False, dur=1), with_char=False)
    sm = cv2.GaussianBlur(cv2.resize(bgf, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA), (0, 0), 3.5)
    bgf = cv2.resize(sm, (OW, OH), interpolation=cv2.INTER_CUBIC)
    k = ease(t / 0.9) * ease((shot['dur'] - t) / 0.9)
    k_in = ease(t / 0.9)
    bgf = (bgf.astype(np.float32) * (0.58 - 0.30 * k_in)).astype(np.uint8)

    # Pure geometric G2 glasses line-art crest above wordmark (camera-free temple + waveguide lenses)
    if k > 0.05:
        cx_g, cy_g = OW // 2, int(OH * 0.16)
        col_g = tuple(int(c * k) for c in GREEN)
        w_l, h_l, gap = int(86 * S), int(52 * S), int(26 * S)
        cv2.rectangle(bgf, (cx_g - gap // 2 - w_l, cy_g - h_l // 2), (cx_g - gap // 2, cy_g + h_l // 2), col_g, max(2, int(4 * S)))
        cv2.rectangle(bgf, (cx_g + gap // 2, cy_g - h_l // 2), (cx_g + gap // 2 + w_l, cy_g + h_l // 2), col_g, max(2, int(4 * S)))
        cv2.line(bgf, (cx_g - gap // 2, cy_g - int(8 * S)), (cx_g + gap // 2, cy_g - int(8 * S)), col_g, max(2, int(4 * S)))
        cv2.line(bgf, (cx_g - gap // 2 - w_l, cy_g - int(10 * S)), (cx_g - gap // 2 - w_l - int(28 * S), cy_g - int(20 * S)), col_g, max(2, int(4 * S)))
        cv2.line(bgf, (cx_g + gap // 2 + w_l, cy_g - int(10 * S)), (cx_g + gap // 2 + w_l + int(28 * S), cy_g - int(20 * S)), col_g, max(2, int(4 * S)))

    specs = (
        (TITLE[0], font('serif', 178), 0.34, (240, 248, 244)),
        (TITLE[1], font('uib', 56), 0.53, (220, 240, 228)),
        (TITLE[2], font('light', 30), 0.67, (165, 215, 185)),
        (TITLE[3], font('mono', 28), 0.75, (134, 255, 175)),
    )
    for n, (txt, fnt, y, col) in enumerate(specs):
        a = ease((t - 0.25 - n * 0.28) / 0.7) * ease((shot['dur'] - t) / 0.9)
        if a <= 0:
            continue
        im = text_rgba(txt, fnt, col, shadow=True, bg=None, pad=10)
        pm = pil_to_pm(im)
        h, w = pm.shape[:2]
        x, yy = (OW - w) // 2, int(OH * y - h / 2)
        roi = bgf[yy:yy + h, x:x + w]
        over(roi, (pm.astype(np.float32) * a).astype(np.uint8))
        bgf[yy:yy + h, x:x + w] = roi
        if n == 0:
            bw = int(380 * S * ease((t - 0.5) / 0.7))
            cv2.rectangle(bgf, (OW // 2 - bw // 2, int(OH * 0.45)), (OW // 2 + bw // 2, int(OH * 0.45) + max(2, int(5 * S))), tuple(int(c * k) for c in GREEN), -1)
    dst[:] = bgf


def draw_night(dst, shot, t):
    cam = (lerp(520, 360, ease(t / 2.5)), 800, 2.5 + 0.12 * ease(t / shot['dur']))
    grab = 2.8
    mid = 'bedroom_mid' if t < grab else 'bedroom_mid_noG2'
    draw_plates(dst, 'bedroom', cam, 0, dict(walk=False, dur=1, bg='bedroom'), with_char=False, mid_override=mid)
    if t > 0.5:
        hand = 'hand' if t < grab else 'hand_g2'
        im = load(hand, BGR_TINT['bedroom'], 1.0)
        k1 = ease((t - 0.5) / 2.1)
        k2 = ease((t - grab) / 2.1)
        wx = lerp(1150, 390, k1) if t < grab else lerp(390, 520, k2)
        wy = lerp(900, 800, k1) if t < grab else lerp(800, 380, k2)
        if t >= grab + 1.4:
            wx += (t - grab - 1.4) * 260
        over(dst, warp(im, spr_M(70, 190, wx, wy, 1, -6, 0.52, cam)))


CLIP_LEN = {}


def shot_at(t):
    for sh in SHOTS:
        if sh['t0'] <= t < sh['t1']:
            return sh
    return SHOTS[-1]


def render_shot(sh, t, i):
    f = np.zeros((OH, OW, 3), np.uint8)
    kind = sh['kind']
    bg = sh.get('bg', 'bedroom')
    if kind == 'room':
        cam = camera(sh, t)
        pt = [None]
        def char_fn(d):
            pt[0] = draw_char(d, sh, t, cam)
        draw_plates(f, bg, cam, t, sh, True, char_fn)
        if sh.get('motes'):
            motes(f, t + sh['t0'], bg)
        if sh.get('wave'):
            wave_bars(f, t, sh['wave'][0], sh['wave'][1], pt[0])
        post(f, i, bg, bloom=0.4 if bg != 'street' else 0.3)
    elif kind == 'night':
        draw_night(f, sh, t)
        motes(f, t + 3, 'bedroom')
        post(f, i, 'bedroom', bloom=0.4)
    elif kind == 'screen':
        f[:] = screen_frame(sh, t)
        post(f, i, 'desk', bloom=0.35)
    elif kind == 'lens':
        draw_lens(f, sh, t, i)
        post(f, i, 'bedroom', bloom=0.5, vignette=False)
    elif kind == 'title':
        draw_title(f, sh, t)
        post(f, i, 'balcony', bloom=0.4, vignette=True)
    return f


def iris_blend(a, b, k, center):
    cx, cy = center[0] * S, center[1] * S
    dkey = ('iris_d', center, OW, OH)
    if dkey not in _cache:
        yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
        _cache[dkey] = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    d = _cache[dkey]
    R = k * math.hypot(OW, OH) * 0.95
    m = np.clip((R - d) / (60 * S) + 0.5, 0, 1)
    m_u8 = (m * 255).astype(np.uint8)
    inv3 = cv2.merge([255 - m_u8] * 3)
    m3 = cv2.merge([m_u8] * 3)
    return cv2.add(cv2.multiply(a, inv3, scale=1.0 / 255.0), cv2.multiply(b, m3, scale=1.0 / 255.0))


def render_frame(i):
    t = i / FPS
    sh = shot_at(t)
    lt = t - sh['t0']
    f = render_shot(sh, lt, i)
    idx = SHOTS.index(sh)
    fade = 0.65 if (sh['kind'] == 'lens' and sh.get('iris')) else sh.get('fade', 0.4)
    if lt < fade and idx > 0:
        prev = SHOTS[idx - 1]
        pf = render_shot(prev, prev['dur'] - 1e-3 + lt, i)
        k = ease(lt / fade)
        f = iris_blend(pf, f, k, sh['iris']) if (sh['kind'] == 'lens' and sh.get('iris')) else cv2.addWeighted(pf, 1 - k, f, k, 0)
    elif lt < sh.get('fade', 0.0) and idx == 0:
        f = (f.astype(np.float32) * ease(lt / sh['fade'])).astype(np.uint8)
    if t > TOTAL - 0.8:
        f = (f.astype(np.float32) * ease((TOTAL - t) / 0.8)).astype(np.uint8)
    draw_caption(f, t, CLIP_LEN, low=sh['kind'] in ('lens', 'screen'))
    return f


def ensure_captures():
    os.makedirs(CAPDIR, exist_ok=True)
    mf = os.path.join(FILM, 'captures.json')
    slots = {s: f'captures/{s}.png' for s in SLOTS}
    if os.path.exists(mf):
        old = json.load(open(mf)).get('slots', {})
        slots = {**old, **slots}
    json.dump({'_note': 'Real 576x288 EvenHub Simulator 0.9.5 captures for OnQ films.', 'slots': slots}, open(mf, 'w'), indent=1)


def load_audio_module():
    spec = importlib.util.spec_from_file_location('film_audio', os.path.join(ROOT, 'scripts', 'make-film-v3-audio.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _resolve_ffmpeg():
    import shutil
    env_ff = os.environ.get('FFMPEG')
    if env_ff:
        return env_ff
    found = shutil.which('ffmpeg')
    if found:
        return found
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def build_audio(out_wav):
    au = load_audio_module()
    os.makedirs(WORK, exist_ok=True)
    clips = []
    for n, (t0, voice_id, _sub_txt, spoken_txt) in enumerate(CAPTIONS):
        p = au.tts(ROOT, WORK, spoken_txt, voice=voice_id)
        clips.append((t0, p))
        CLIP_LEN[n] = len(au.read_wav(p)) / au.SR
    sfx = []
    for sh in SHOTS:
        for off, kind in sh.get('sfx', []):
            sfx.append((sh['t0'] + off, kind))
        if sh['kind'] == 'lens' and sh.get('iris'):
            sfx.append((sh['t0'] - 0.1, 'whoosh', 0.6))
    return au.mix(ROOT, WORK, TOTAL, SCENES, sfx, clips, _resolve_ffmpeg(), out_wav)


def _init_worker(clip_len):
    CLIP_LEN.update(clip_len)
    cv2.setNumThreads(1)


def _work(i):
    return render_frame(i).tobytes()


def main():
    t_start = time.time()
    if not os.path.exists(os.path.join(LAY, 'manifest.json')):
        subprocess.run(['node', os.path.join(ROOT, 'scripts', 'make-film-v3-layers.mjs')], cwd=ROOT, check=True)
    ensure_captures()
    out_path = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'media', 'out', 'onq-film-v5-day-in-life.mp4')

    if '--preview' in sys.argv:
        pdir = os.path.join(FILM, 'preview-v5')
        os.makedirs(pdir, exist_ok=True)
        for sec, label in [(10, '01_grip'), (17, '02_computer'), (30, '03_draft'), (59, '04_pr_gate'), (86, '05_conflict'), (116, '06_career'), (145, '07_killswitch'), (160, '08_title')]:
            cv2.imwrite(os.path.join(pdir, f'{label}.png'), render_frame(int(sec * FPS)))
        print(f'V5_PREVIEW_OK total={TOTAL}s frames={NFRAMES}')
        return

    wav = os.path.join(WORK, 'film_v5_audio.wav')
    stats = build_audio(wav)
    print('v5 audio:', stats, 'total %.1fs, %d frames' % (TOTAL, NFRAMES))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cmd = [_resolve_ffmpeg(), '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
           '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', '-', '-i', wav, '-c:v', 'libx264',
           '-preset', 'fast' if DRAFT else 'medium', '-crf', '24', '-maxrate', '4000k', '-bufsize', '8000k',
           '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out_path]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    import multiprocessing as mp
    nproc = max(1, min(int(os.environ.get('FILM_PROCS', '6')), (os.cpu_count() or 6) - 1))
    with mp.Pool(nproc, initializer=_init_worker, initargs=(dict(CLIP_LEN),)) as pool:
        for n, b in enumerate(pool.imap(_work, range(NFRAMES), chunksize=8)):
            pr.stdin.write(b)
            if n % 300 == 0:
                print('frame %d/%d  %.0fs' % (n, NFRAMES, time.time() - t_start), flush=True)
    pr.stdin.close()
    pr.wait()
    if pr.returncode != 0:
        raise SystemExit(f'ffmpeg failed ({pr.returncode})')
    print('FILM_V5_WRITTEN', out_path, 'in %.0fs' % (time.time() - t_start))


if __name__ == '__main__':
    main()
