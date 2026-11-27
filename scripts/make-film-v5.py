"""OnQ Flagship Launch Film v5 ("Day in the Life with OnQ" — Dynamic Multi-Layer Animated Edition):
Full v4 dynamic multi-layer parallax anime cinematography (hand grab, walking street parallax,
blinking/talking wearer, iris-zoom into lens, floating motes, reactive voice waves, film bloom/grain)
+ STRICT in-lens Even G2 optical waveguide fit (zero bezel overhang)
+ living monochrome Voice Orb + refreshed zero-clutter EvenHub Simulator 0.9.5 captures
+ OnQ Studio obsidian website typography + AssemblyAI TTS-1 dual-voice + -16 LUFS mastered score.
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

GREEN = (126, 245, 52)        # BGR of #34f57e
GREEN_RGB = (52, 245, 126)    # #34f57e
MINT_RGB = (184, 255, 209)    # #b8ffd1
BG_RGB = (7, 10, 8)           # #070a08 OnQ website obsidian
PANEL_RGB = (14, 19, 16)      # #0e1310
BORDER_RGB = (29, 44, 35)     # #1d2c23
TEXT_RGB = (234, 243, 237)    # #eaf3ed
MUTED_RGB = (147, 166, 152)   # #93a698

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

# Carefully timed non-overlapping dual-voice narration across 7 Day-in-the-Life acts (165.0s / 2:45)
CAPTIONS = [
    (1.2, VOICE_ONQ, '08:00 AM · Put on camera-free Even G2. Instant PC AI auto-sync.', 'Eight AM. You already own a computer running your AI tools.'),
    (8.0, VOICE_ONQ, 'OnQ turns your PC into the AI brain, and Even G2 into a quiet optical window.', 'OnQ turns your PC into the brain, and Even G2 into a quiet window you wear all day.'),
    (14.6, VOICE_ONQ, 'OnQ: "PC host synced. Ollama Qwen3, load balancer, and OpenBot ready at zero cost."', 'P C host synced. Ollama Qwen three, load balancer, and OpenBot ready at zero cost.'),
    (20.6, VOICE_WEARER, '08:15 AM · Wearer: "Show my morning brief, and mark Q4 deck review done."', 'Eight fifteen. Show my morning brief, and mark Q4 deck review done.'),
    (27.2, VOICE_ONQ, 'OnQ: "Notion task staged Default-NO. Tap YES for the 2-second undo ring."', 'Notion task staged Default-NO. Tap yes for the two-second undo ring, then done with a receipt.'),
    (36.5, VOICE_ONQ, 'OnQ: "Confirmed. Live Notion checked off; weather and schedule synced cleanly."', 'Confirmed. Notion checked off and morning schedule updated cleanly.'),
    (45.8, VOICE_WEARER, '10:30 AM · Wearer: "OnQ, run software crew and prep the PR for master."', 'Ten thirty, away from the desk. OnQ, run software crew and prep the P R for master.'),
    (53.2, VOICE_ONQ, 'OnQ: "537 tests pass on your local PC. Diff summarized. L5 blocks force push."', 'Five hundred thirty seven tests pass on your local P C. Diff summarized, L5 blocks force push.'),
    (63.2, VOICE_ONQ, 'OnQ: "PR gate staged Default-NO. Approve once on glasses or Telegram."', 'P R gate staged Default-NO. Approve once on glasses or Telegram.'),
    (75.8, VOICE_WEARER, '13:48 PM · Wearer: "Move investor sync to 14:45 and reply to the thread."', 'One forty eight, walking into investor sync. Move sync to two forty five.'),
    (82.0, VOICE_ONQ, 'OnQ: "Blocked in 31ms: HTTP 409 busy slot. Zero LLM calls; 15:45 is free."', 'Blocked in thirty one milliseconds. H T T P 409 conflict lock; fifteen forty five is free.'),
    (90.5, VOICE_ONQ, 'OnQ: "Live Meeting Scribe runs in RAM, speaking to paired earbuds only."', 'Meeting Scribe runs live in memory, speaking only to paired earbuds because G2 has no speaker.'),
    (102.8, VOICE_WEARER, '16:00 PM · Wearer: "Over encrypted tunnel: run career pack for AI Engineer roles."', 'Four PM over encrypted tunnel. Run career pack for AI Engineer roles.'),
    (111.0, VOICE_ONQ, 'OnQ: "Three matching roles logged to Notion. Recruiter draft verified by Code-Guard."', 'Three roles logged to Notion tracker. Recruiter draft verified by Code-Guard.'),
    (120.5, VOICE_ONQ, 'OnQ: "Human-in-the-loop gate: zero blind spam until you tap YES."', 'Human-in-the-loop gate: zero blind spam until you tap yes.'),
    (130.6, VOICE_ONQ, '18:30 PM · Telegram Control Center, Bot Studio, and one-tap Kill Switch (HTTP 423).', 'Six thirty PM. Evening recap, Telegram Bot Studio, and one-tap Kill Switch lock everything cleanly.'),
    (141.5, VOICE_ONQ, 'OnQ: "Every write audited, reversible, and kept under your control."', 'Every write audited, reversible, and kept under your control.'),
    (150.0, VOICE_ONQ, 'OnQ. Your PC AI brain on Even G2 — Sim-Verified and ready to ship.', 'OnQ. Your P C AI brain on Even G2. Simulator verified, private, and ready to ship.'),
]

TITLE = (
    'OnQ.',
    'Your PC AI brain, on Even G2.',
    'Reply. Schedule. Plan. Remember. Confirm.',
    '537 Tests · 17 Sim PNGs · 32/32 Eval · 11/11 Geometry · 10/10 Security · Sim-Verified',
    'vaibhav4046.github.io/onq-even-g2/demo/  ·  github.com/vaibhav4046/onq-even-g2',
)


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, k):
    return a + (b - a) * k


def _shots():
    R = 'room'
    return [
        # Act 1: 08:00 AM · Wake, Grab Even G2 Off Nightstand, Put On & Instant PC Auto-Sync (0.0 -> 20.0s)
        (R, 5.5, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-4), cam=((1152, 700, 1.0), (1160, 690, 1.15)), fade=1.0, vignette=0.55,
                      keys=[(0, 'sleep', 0, 0), (3.5, 'neutral', 0, 0), (4.8, 'neutral', 0, -1)], sfx=[(3.4, 'alarm')], motes=True)),
        ('night', 5.5, dict(sfx=[(0.2, 'whoosh')])),
        (R, 3.0, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-4), cam=((1160, 720, 1.25), (1140, 640, 1.6)), fade=0.35,
                      keys=[(0, 'neutral', 0, 0), (0.5, 'neutral', 1, 0), (1.4, 'smile', 1, 0)], flash=0.5, glow=[(1.0, 3.0, 0.8)], motes=True)),
        ('lens', 6.0, dict(slot='computer', bg='desk', icon='pc', orb=True,
                           tag='08:00 AM · PC AUTO-SYNC · LOAD BALANCER + OLLAMA ($0)',
                           cam=((1300, 560, 1.0), (1300, 560, 1.06)), iris=(1000, 380), sfx=[(0.4, 'chime'), (1.0, 'pair')])),

        # Act 2: 08:15 AM · Morning Brief & One-Tap Notion Completion (20.0 -> 45.0s)
        (R, 4.0, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-3), cam=((1150, 690, 1.2), (1150, 690, 1.15)), fade=0.4,
                      keys=[(0, 'focused', 1, 0)], talk=[(0.6, 3.2)], glow=[(0, 4.0, 0.55)], sfx=[(0.4, 'listen')], wave=(0.6, 3.2))),
        ('lens', 5.5, dict(slot='card', bg='bedroom', icon='calendar', orb=True,
                           tag='08:15 AM · MORNING BRIEF · WEATHER + CAL + GMAIL',
                           cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 5.5, dict(slot='draft', bg='bedroom', icon='shield', orb=True,
                           tag='DEFAULT-NO PREVIEW · ZERO UNCONFIRMED WRITES',
                           cam=((1500, 520, 1.04), (1500, 520, 1.09)), iris=None, sfx=[(0.4, 'chime')])),
        ('lens', 5.0, dict(slot='ring', bg='bedroom', icon='ring', orb=False,
                           tag='2.0s 4-BIT GRAY4 UNDO RING · TAP TO ABORT',
                           cam=((1500, 520, 1.06), (1500, 520, 1.11)), iris=(1000, 380), sfx=[(0.4, 'tick'), (0.9, 'tick'), (1.4, 'tick'), (1.9, 'tick')])),
        ('lens', 5.0, dict(slot='done', bg='bedroom', icon='check', orb=True,
                           tag='RECEIPT COMMITTED · LIVE NOTION UPDATED',
                           cam=((1500, 520, 1.08), (1500, 520, 1.12)), iris=None, sfx=[(0.3, 'ding')])),

        # Act 3: 10:30 AM · Coding From Glasses & Extensive PR Gate (45.0 -> 75.0s)
        (R, 4.5, dict(bg='desk', char=dict(x=900, y=640, s=1.15, rot=-2), cam=((1152, 600, 1.0), (1100, 590, 1.08)), fade=0.45,
                      keys=[(0, 'focused', 1, 1)], talk=[(0.7, 3.4)], glow=[(0, 4.5, 0.55)], sfx=[(0.5, 'listen')], wave=(0.7, 3.4), motes=True)),
        ('screen', 6.5, dict(state='term', sfx=[(0.2, 'whoosh')])),
        ('lens', 6.5, dict(slot='pr_gate', bg='desk', icon='code', orb=True,
                           tag='10:30 AM · CODING PR GATE · L5 BLOCKS FORCE PUSH',
                           cam=((1300, 560, 1.0), (1300, 560, 1.05)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 6.5, dict(slot='summary', bg='desk', icon='pc', orb=True,
                           tag='L4 SOFTWARE CREW · 537 TESTS VERIFIED',
                           cam=((1300, 560, 1.03), (1300, 560, 1.08)), iris=None, sfx=[(0.4, 'chime')])),
        ('lens', 6.0, dict(slot='ring', bg='desk', icon='telegram', orb=False,
                           tag='TELEGRAM + G2 SYNC · SINGLE-USE APPROVAL',
                           cam=((1300, 560, 1.05), (1300, 560, 1.1)), iris=None, sfx=[(0.4, 'tick'), (1.0, 'ding')])),

        # Act 4: 13:48 PM · Walking Street Corridor, 31ms 409 Lock & RAM Meeting Scribe (75.0 -> 102.0s)
        (R, 4.5, dict(bg='street', walk=True, k=0.14, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.0), (1152, 640, 1.08)), fade=0.45, strt=0.55,
                      keys=[(0, 'neutral', 1, 0), (1.0, 'focused', 1, 0)], sfx=[(0.8, 'notify')], glow=[(0.8, 4.5, 0.7)], talk=[(1.0, 3.2)], wave=(1.0, 3.2))),
        ('lens', 7.5, dict(slot='conflict', bg='street', icon='lock', orb=True,
                           tag='31ms HTTP 409 CONFLICT LOCK · 0 LLM CALLS',
                           cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'kill')])),
        ('screen', 6.5, dict(state='voice_scribe', sfx=[(0.2, 'whoosh'), (0.8, 'chime')])),
        ('lens', 8.5, dict(slot='video', bg='street', icon='orb', orb=True,
                           tag='LIVE MEETING SCRIBE · RAM-ONLY · EARBUDS TTS-1',
                           cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'chime')])),

        # Act 5: 16:00 PM · Remote Tunnel + Automated Job Research & Career Pack (102.0 -> 130.0s)
        (R, 4.5, dict(bg='street', walk=True, k=0.52, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.0), (1152, 648, 1.08)), fade=0.45,
                      keys=[(0, 'focused', 1, 0)], talk=[(0.6, 3.5)], glow=[(0, 4.5, 0.55)], sfx=[(0.5, 'listen')], wave=(0.6, 3.5))),
        ('screen', 7.5, dict(state='career_ui', sfx=[(0.2, 'whoosh'), (0.9, 'notify')])),
        ('lens', 8.5, dict(slot='career', bg='street', icon='notion', orb=True,
                           tag='CAREER PACK · NOTION TRACKER + CODE-GUARD DRAFT',
                           cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 7.5, dict(slot='ring', bg='street', icon='shield', orb=False,
                           tag='HUMAN GATE · ZERO BLIND SPAM · DEFAULT-NO',
                           cam=((1500, 520, 1.04), (1500, 520, 1.09)), iris=None, sfx=[(0.4, 'tick'), (1.0, 'ding')])),

        # Act 6: 18:30 PM · Evening Balcony, Telegram Control Center & Kill Switch (130.0 -> 148.0s)
        ('screen', 6.0, dict(state='telegram_ui', sfx=[(0.2, 'whoosh'), (0.8, 'notify')])),
        ('lens', 6.0, dict(slot='recap', bg='balcony', icon='telegram', orb=True,
                           tag='18:30 PM · EVENING RECAP · ALL WRITES AUDITED',
                           cam=((1500, 520, 1.0), (1500, 520, 1.05)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 6.0, dict(slot='killswitch', bg='balcony', icon='lock', orb=True,
                           tag='GLOBAL KILL SWITCH · HTTP 423 PAUSES ALL AGENTS',
                           cam=((1500, 520, 1.02), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'kill')])),

        # Act 7: Evening Balcony Outro & Grand OnQ Lockup (148.0 -> 165.0s)
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
        s = (s.astype(np.float32) * opacity).astype(np.uint8)
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
    col = (170, 235, 200) if bg != 'balcony' else (150, 245, 190)
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
    path = {'ui': 'segoeuisb.ttf', 'uib': 'segoeuib.ttf', 'mono': 'consola.ttf', 'monob': 'consolab.ttf', 'serif': 'georgiab.ttf', 'light': 'segoeuisl.ttf'}[name]
    p = 'C:/Windows/Fonts/' + path
    if not os.path.exists(p):
        p = 'C:/Windows/Fonts/segoeuib.ttf'
    return ImageFont.truetype(p, max(8, int(round(size * S))))


def text_rgba(txt, fnt, color=(255, 255, 255), shadow=True, pad=18, bg=(8, 14, 11, 185), border=None, radius=14):
    tmp = Image.new('RGBA', (10, 10))
    d = ImageDraw.Draw(tmp)
    box = d.textbbox((0, 0), txt, font=fnt)
    w, h = box[2] - box[0], box[3] - box[1]
    pw, ph = int(pad * S * 1.3), int(pad * S * 0.6)
    im = Image.new('RGBA', (w + 2 * pw + 4, h + 2 * ph + int(8 * S)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        d.rounded_rectangle(
            [0, 0, im.width - 1, im.height - 1],
            radius=int(radius * S),
            fill=bg,
            outline=border,
            width=max(1, int(1.5 * S)) if border else 0,
        )
    if shadow:
        d.text((pw - box[0] + int(2 * S), ph - box[1] + int(3 * S)), txt, font=fnt, fill=(0, 0, 0, 185))
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
        col = MINT_RGB if voice == VOICE_ONQ else TEXT_RGB
        bg = (7, 20, 13, 215) if voice == VOICE_ONQ else (10, 14, 12, 205)
        border = (52, 245, 126, 95) if voice == VOICE_ONQ else (62, 82, 70, 95)
        sz = 34 if len(sub_txt) <= 80 else 30
        _capcache[i] = pil_to_pm(text_rgba(sub_txt, font('ui', sz), color=col, bg=bg, border=border, pad=16, radius=14))
    return _capcache[i]


def draw_caption(dst, t, clip_len):
    for i, (t0, _, _, _) in enumerate(CAPTIONS):
        d = clip_len.get(i, 4.2)
        t1 = t0 + d + 0.35
        if t0 - 0.15 <= t <= t1 + 0.25:
            a = min(ease((t - (t0 - 0.15)) / 0.25), ease((t1 + 0.25 - t) / 0.25))
            im = caption_layer(i)
            h, w = im.shape[:2]
            x = max(0, (OW - w) // 2)
            y = max(0, int(OH - 26 * S - h + (1.0 - a) * 10 * S))
            wf = min(w, OW - x)
            hf = min(h, OH - y)
            roi = dst[y:y + hf, x:x + wf]
            over(roi, im[:hf, :wf], a)
            dst[y:y + hf, x:x + wf] = roi
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
    """STRICT IN-LENS FIT: 576x288 simulator capture scaled to 1.66*S (956x478 px on 1080p)
    strictly inside the realistic matte-titanium Even G2 lens aperture (ZERO rim overhang).
    """
    key = ('hud_dyn', slot, S)
    if key not in _cache:
        cap = get_capture(slot)
        lum = cv2.cvtColor(cap, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        lum = np.maximum(lum, cap.max(2).astype(np.float32) / 255.0 * 0.94)
        k = 1.66 * S
        big = np.clip(cv2.resize(lum, (int(round(576 * k)), int(round(288 * k))), interpolation=cv2.INTER_CUBIC), 0, 1)
        rows = np.arange(big.shape[0])
        big *= (1.0 - 0.11 * ((rows // max(1, int(round(2 * S)))) % 2))[:, None]
        g = np.dstack([big * GREEN[0], big * GREEN[1], big * GREEN[2]]).astype(np.uint8)
        hh, ww = g.shape[:2]
        L = int(20 * S)
        fr = np.zeros_like(g)
        for (x, y, dx, dy) in ((0, 0, 1, 1), (ww - 1, 0, -1, 1), (0, hh - 1, 1, -1), (ww - 1, hh - 1, -1, -1)):
            cv2.line(fr, (x, y), (x + dx * L, y), GREEN, max(1, int(2 * S)))
            cv2.line(fr, (x, y), (x, y + dy * L), GREEN, max(1, int(2 * S)))
        _cache[key] = cv2.add(g, (fr.astype(np.float32) * 0.44).astype(np.uint8))
    return _cache[key]


def lens_aperture_overlay():
    """Realistic thin matte-titanium Even Realities G2 rectangular-panto spectacle aperture (superellipse p=3.4)."""
    key = ('lens_aperture_dyn', S)
    if key not in _cache:
        yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
        cx, cy = OW * 0.50, OH * 0.475
        rx, ry = OW * 0.445, OH * 0.398
        p = 3.4
        d = (np.abs((xx - cx) / rx) ** p + np.abs((yy - cy) / ry) ** p) ** (1.0 / p)
        outside = np.clip((d - 0.965) / 0.045, 0.0, 1.0)
        a = np.clip(outside * 246.0, 0, 246)
        inner_vig = np.clip((d - 0.72) / 0.28, 0.0, 1.0) ** 2.0 * 78.0
        a = np.maximum(a, inner_vig * (1.0 - outside))
        ov = np.zeros((OH, OW, 4), np.float32)
        frame_col = np.array([14, 16, 15], np.float32)
        ov[..., :3] = frame_col * (a[..., None] / 255.0)
        ov[..., 3] = a
        rim = np.exp(-((d - 0.972) / 0.0085) ** 2)
        ang = np.arctan2(yy - cy, xx - cx)
        spec = 0.28 + 0.55 * (np.clip(np.cos(ang + 2.15), 0, 1) ** 3)
        ov[..., :3] += (rim * spec * 185.0)[..., None] * np.array([0.85, 0.96, 0.88], np.float32)
        ov[..., 3] = np.maximum(ov[..., 3], rim * spec * 185.0)
        sheen = np.exp(-(((xx - cx) * 0.55 + (yy - cy) * 0.85 + 310 * S) / (75 * S)) ** 2) * np.clip(1.0 - d, 0, 1) * 14.0
        _cache[key] = (np.clip(ov, 0, 255).astype(np.uint8), np.clip(sheen, 0, 255).astype(np.uint8))
    return _cache[key]


def draw_voice_orb(dst, cx, cy, radius, t, speaking=False):
    """Minimal Meta-style living monochrome Voice Orb strictly inside lens or title crest."""
    r = max(10, int(radius * S))
    cx, cy = int(cx), int(cy)
    layer = np.zeros((OH, OW, 3), np.uint8)
    pulse = 1.0 + (0.14 if speaking else 0.06) * math.sin(t * (7.5 if speaking else 2.8))
    rc = int(r * 0.55 * pulse)
    cv2.circle(layer, (cx, cy), int(r * pulse), (48, 128, 30), max(1, int(2 * S)), cv2.LINE_AA)
    ang = (t * (55 if speaking else 24)) % 360
    cv2.ellipse(layer, (cx, cy), (int(r * 0.92), int(r * 0.44)), ang, 0, 360, GREEN, max(1, int(2 * S)), cv2.LINE_AA)
    cv2.ellipse(layer, (cx, cy), (int(r * 0.86), int(r * 0.36)), -ang * 0.7 + 45, 0, 360, (180, 255, 196), max(1, int(1.5 * S)), cv2.LINE_AA)
    cv2.circle(layer, (cx, cy), rc, GREEN, max(2, int(2.5 * S)), cv2.LINE_AA)
    cv2.circle(layer, (cx, cy), max(3, rc // 3), (200, 255, 215), -1, cv2.LINE_AA)
    if speaking:
        for bi in range(-2, 3):
            bh = int((6 + 10 * abs(math.sin(t * 9.5 + bi * 1.1))) * S)
            bx = cx + int(bi * 8 * S)
            by = cy + r + int(14 * S)
            cv2.line(layer, (bx, by - bh // 2), (bx, by + bh // 2), GREEN, max(1, int(3 * S)), cv2.LINE_AA)
    glow = cv2.GaussianBlur(layer, (0, 0), max(3, int(9 * S)))
    cv2.addWeighted(dst, 1.0, glow, 0.55, 0, dst=dst)
    cv2.addWeighted(dst, 1.0, layer, 0.95, 0, dst=dst)


def draw_app_badge_glyph(dst, icon_kind, cx, cy):
    sz = int(34 * S)
    x0, y0 = int(cx - sz // 2), int(cy - sz // 2)
    im = Image.new('RGBA', (sz, sz), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    g = (52, 245, 126, 235)
    g_soft = (52, 245, 126, 95)
    w = max(1, int(2 * S))
    d.rounded_rectangle([1, 1, sz - 2, sz - 2], radius=int(8 * S), fill=(6, 26, 14, 185), outline=g_soft, width=w)
    m = int(7 * S)
    if icon_kind == 'calendar':
        d.rounded_rectangle([m, m + int(2 * S), sz - m, sz - m], radius=int(3 * S), outline=g, width=w)
        d.line([(m, m + int(7 * S)), (sz - m, m + int(7 * S))], fill=g, width=w)
    elif icon_kind == 'telegram':
        d.polygon([(m, sz // 2), (sz - m, m), (sz - m - int(3 * S), sz - m), (sz // 2, sz // 2 + int(2 * S))], outline=g, width=w)
    elif icon_kind == 'code':
        d.line([(sz // 2 - int(3 * S), m + int(2 * S)), (m, sz // 2), (sz // 2 - int(3 * S), sz - m - int(2 * S))], fill=g, width=w)
        d.line([(sz // 2 + int(3 * S), m + int(2 * S)), (sz - m, sz // 2), (sz // 2 + int(3 * S), sz - m - int(2 * S))], fill=g, width=w)
    elif icon_kind == 'notion':
        d.rectangle([m, m, sz - m, sz - m], outline=g, width=w)
        d.line([(m + int(4 * S), sz - m - int(3 * S)), (m + int(4 * S), m + int(3 * S)), (sz - m - int(4 * S), sz - m - int(3 * S)), (sz - m - int(4 * S), m + int(3 * S))], fill=g, width=w)
    elif icon_kind == 'lock':
        d.rounded_rectangle([m + int(1 * S), sz // 2 - int(1 * S), sz - m - int(1 * S), sz - m], radius=int(3 * S), outline=g, width=w)
        d.arc([m + int(4 * S), m, sz - m - int(4 * S), sz // 2 + int(4 * S)], 180, 0, fill=g, width=w)
    elif icon_kind == 'check':
        d.line([(m, sz // 2), (sz // 2 - int(1 * S), sz - m - int(2 * S)), (sz - m, m + int(2 * S))], fill=g, width=max(2, int(2.5 * S)))
    else:
        d.ellipse([m, m, sz - m, sz - m], outline=g, width=w)
        d.ellipse([sz // 2 - int(3 * S), sz // 2 - int(3 * S), sz // 2 + int(3 * S), sz // 2 + int(3 * S)], fill=g)
    pm = pil_to_pm(im)
    roi = dst[y0:y0 + sz, x0:x0 + sz]
    over(roi, pm)
    dst[y0:y0 + sz, x0:x0 + sz] = roi


def draw_lens(dst, shot, t, i):
    """Dynamic animated background world seen THROUGH Even G2 lens with STRICT in-lens HUD fit (ZERO rim overhang)."""
    bg = shot['bg']
    cam = camera(shot, t)
    world = np.zeros((OH, OW, 3), np.uint8)
    draw_plates(world, bg, cam, t, dict(shot, walk=(bg == 'street'), scroll_v=60 if bg == 'street' else 0, k=0.55), with_char=False)
    sm = cv2.GaussianBlur(cv2.resize(world, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA), (0, 0), 3.6)
    bgb = (cv2.resize(sm, (OW, OH), interpolation=cv2.INTER_CUBIC).astype(np.float32) * 0.52).astype(np.uint8)

    hud = hud_layer(shot['slot'])
    hh, ww = hud.shape[:2]
    k_in = ease(t / 0.42)
    flick = 1.0 if t > 0.36 else (0.85 + 0.15 * math.sin(t * 72)) * k_in
    dx = int(round(3 * S * math.sin(t * 0.55)))
    dy = int(round(3 * S * math.sin(t * 0.85)))
    x = OW // 2 - ww // 2 + dx
    y = int(OH * 0.455) - hh // 2 + dy

    pane = np.zeros((OH // 4, OW // 4), np.float32)
    pad_p = int(26 * S)
    cv2.rectangle(
        pane,
        (max(0, (x - pad_p) // 4), max(0, (y - pad_p) // 4)),
        (min(OW // 4 - 1, (x + ww + pad_p) // 4), min(OH // 4 - 1, (y + hh + pad_p) // 4)),
        1.0,
        -1,
    )
    pane = cv2.resize(cv2.GaussianBlur(pane, (0, 0), 5.0 * S), (OW, OH), interpolation=cv2.INTER_LINEAR) * 0.74 * k_in
    bgb = (bgb.astype(np.float32) * (1.0 - pane[..., None])).astype(np.uint8)

    layer = np.zeros((OH, OW, 3), np.uint8)
    layer[y:y + hh, x:x + ww] = (hud.astype(np.float32) * flick).astype(np.uint8)
    if t < 0.6:
        sy = int(y + hh * (t / 0.6))
        cv2.rectangle(layer, (x, max(0, sy - int(1.5 * S))), (x + ww, sy + int(1.5 * S)), tuple(int(c * 0.6) for c in GREEN), -1)

    l_sm = cv2.resize(layer, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA)
    g1 = cv2.resize(cv2.GaussianBlur(l_sm, (0, 0), 2.3 * S), (OW, OH), interpolation=cv2.INTER_LINEAR)
    g2 = cv2.resize(cv2.GaussianBlur(l_sm, (0, 0), 7.8 * S), (OW, OH), interpolation=cv2.INTER_LINEAR)
    cv2.addWeighted(bgb, 1.0, layer, 1.0, 0, dst=bgb)
    cv2.addWeighted(bgb, 1.0, g1, 0.25, 0, dst=bgb)
    cv2.addWeighted(bgb, 1.0, g2, 0.13, 0, dst=bgb)

    if shot.get('icon'):
        draw_app_badge_glyph(bgb, shot['icon'], x - int(42 * S), y + int(22 * S))
    if shot.get('orb'):
        draw_voice_orb(bgb, OW // 2, y + hh + int(50 * S), 24, t + shot['t0'], speaking=True)

    ov, sheen = lens_aperture_overlay()
    over(bgb, ov)
    add(bgb, cv2.merge([sheen] * 3), 0.75)

    tag = shot.get('tag')
    if tag:
        tm = pil_to_pm(text_rgba(tag, font('mono', 19), color=MINT_RGB, shadow=False, pad=10, bg=(8, 22, 14, 215), border=(52, 245, 126, 110), radius=8))
        th, tw = tm.shape[:2]
        tx, ty = int(38 * S), int(22 * S)
        roi = bgb[ty:ty + th, tx:tx + tw]
        over(roi, tm)
        bgb[ty:ty + th, tx:tx + tw] = roi

    bkey = ('simbadge_dyn', S)
    if bkey not in _cache:
        _cache[bkey] = pil_to_pm(text_rgba('EVENHUB SIM 0.9.5 · SANDBOX', font('mono', 18), color=MUTED_RGB, shadow=False, pad=10, bg=(8, 16, 12, 210), border=(42, 74, 54, 130), radius=8))
    bm = _cache[bkey]
    bh, bw = bm.shape[:2]
    bx, by = OW - bw - int(38 * S), int(22 * S)
    roi_b = bgb[by:by + bh, bx:bx + bw]
    over(roi_b, bm)
    bgb[by:by + bh, bx:bx + bw] = roi_b
    dst[:] = bgb


def screen_frame(shot, t):
    """Dynamic OnQ Studio companion interface card over animated desk depth backdrop (ZERO cartoon face)."""
    st = shot['state']
    dur = shot['dur']
    key = ('scrbg_dyn', S)
    if key not in _cache:
        w = cv2.warpAffine(load('desk_back', BGR_TINT['desk'], S), layer_M(1152, 700, 1.0), (OW, OH))
        bg = np.zeros((OH, OW, 3), np.uint8)
        bg[:] = (10, 18, 14)
        over(bg, w)
        small = cv2.GaussianBlur(cv2.resize(bg, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA), (0, 0), 5)
        _cache[key] = (cv2.resize(small, (OW, OH), interpolation=cv2.INTER_CUBIC) * 0.48).astype(np.uint8)
    frame = _cache[key].copy()

    z = lerp(1.0, 1.045, ease(t / dur))
    sw, sh = int(1460 * S * z), int(790 * S * z)
    img = Image.new('RGB', (sw, sh), BG_RGB)
    d = ImageDraw.Draw(img)
    px = lambda v: int(v * S * z)

    d.rectangle([0, 0, sw, px(50)], fill=PANEL_RGB)
    d.line([(0, px(50)), (sw, px(50))], fill=BORDER_RGB, width=max(1, px(2)))
    for i, c in enumerate(((255, 96, 92), (255, 189, 68), (52, 245, 126))):
        d.ellipse([px(22 + i * 24), px(18), px(34 + i * 24), px(30)], fill=c)
    d.text((px(110), px(13)), 'OnQ · Local-First Personal AI Studio', font=font('mono', 20 * z), fill=MUTED_RGB)
    d.rounded_rectangle([sw - px(255), px(10), sw - px(22), px(40)], radius=px(14), fill=(12, 42, 24), outline=GREEN_RGB, width=max(1, px(1.5)))
    d.text((sw - px(236), px(15)), 'PC HOST · LIVE SYNC', font=font('mono', 16 * z), fill=GREEN_RGB)

    if st == 'term':
        d.text((px(64), px(76)), 'PC AI POWER SOURCE · CODING PR GATE', font=font('uib', 34 * z), fill=TEXT_RGB)
        d.text((px(64), px(120)), 'Weighted least-latency load balancer · Circuit breaker · L5 safety boundary', font=font('ui', 22 * z), fill=MUTED_RGB)
        lines = [
            ('$ onq /code prep pr --host ollama:qwen3:1.7b', TEXT_RGB),
            ('pool     Ollama (local) · OmniRoute (295 models) · OpenBot · $0 API', MINT_RGB),
            ('tests    PASS  537/537 Vitest · 32/32 Eval · 11/11 Geometry · 0 TS err', GREEN_RGB),
            ('pr gate  branch master · diff clean · Default-NO approval staged', MINT_RGB),
        ]
        fnt = font('mono', 26 * z)
        y = 178
        nch = int(t * 78)
        for txt, col in lines:
            if nch <= 0:
                break
            d.text((px(64), px(y)), txt[:nch], font=fnt, fill=col)
            nch -= len(txt) + 3
            y += 62
        chips = [
            ('Approve Dry-Run PR', 'Single-use L2 token', True),
            ('Approve via Telegram', 'Owner DM inline gate', False),
            ('L5 Force Push Guard', 'Permanently blocked', False),
        ]
        for ci, (ct, cs, sel) in enumerate(chips):
            cx0 = 64 + ci * 452
            active = sel and t > 1.8
            d.rounded_rectangle(
                [px(cx0), px(470), px(cx0 + 428), px(600)],
                radius=px(14),
                fill=(14, 48, 28) if active else PANEL_RGB,
                outline=GREEN_RGB if active else BORDER_RGB,
                width=max(1, px(2.5 if active else 1.5)),
            )
            d.text((px(cx0 + 24), px(496)), ct, font=font('uib', 24 * z), fill=GREEN_RGB if active else TEXT_RGB)
            d.text((px(cx0 + 24), px(540)), cs, font=font('mono', 19 * z), fill=MINT_RGB if active else MUTED_RGB)
        d.text((px(64), px(655)), 'Zero unapproved pushes. Zero leaked secrets. Verified on your own machine.', font=font('ui', 23 * z), fill=MUTED_RGB)

    elif st == 'voice_scribe':
        d.text((px(64), px(76)), 'LIVE MEETING SCRIBE · RAM-ONLY VOICE ORB', font=font('uib', 34 * z), fill=TEXT_RGB)
        d.text((px(64), px(120)), 'AssemblyAI STT-3.7 real-time diarization · TTS-1 audio routes to paired earbuds only', font=font('ui', 22 * z), fill=MUTED_RGB)
        cx_, cy_, r = px(280), px(435), px(142)
        for ri, col in [(r, (24, 86, 48)), (int(r * 0.78), (38, 152, 82)), (int(r * 0.54), GREEN_RGB)]:
            pulse = 1.0 + 0.08 * math.sin(t * 6.5 + ri * 0.03)
            rr = int(ri * pulse)
            d.ellipse([cx_ - rr, cy_ - rr, cx_ + rr, cy_ + rr], outline=col, width=max(2, px(3)))
        d.ellipse([cx_ - px(32), cy_ - px(32), cx_ + px(32), cy_ + px(32)], fill=(18, 92, 48), outline=MINT_RGB, width=max(2, px(2)))
        for bi in range(16):
            bh = px(16 + 56 * abs(math.sin(t * 8.2 + bi * 0.55)))
            bx = px(510 + bi * 52)
            d.rounded_rectangle([bx, px(640) - bh, bx + px(28), px(640)], radius=px(5), fill=GREEN_RGB if bi % 2 == 0 else MINT_RGB)
        d.rounded_rectangle([px(510), px(210), px(1390), px(505)], radius=px(16), fill=PANEL_RGB, outline=GREEN_RGB, width=max(1, px(2)))
        d.text((px(546), px(244)), 'LIVE DIARIZED TRANSCRIPT (EPHEMERAL RAM)', font=font('mono', 20 * z), fill=GREEN_RGB)
        d.text((px(546), px(298)), 'Speaker A (You): "Lock Q4 metrics for Thursday."', font=font('ui', 26 * z), fill=TEXT_RGB)
        d.text((px(546), px(352)), 'Speaker B (Investor): "Send Q4 deck by Thursday 15:00."', font=font('ui', 26 * z), fill=MINT_RGB)
        d.text((px(546), px(424)), 'Honest hardware boundary: Even G2 has no speaker · TTS plays via paired earbuds.', font=font('mono', 19 * z), fill=MUTED_RGB)

    elif st == 'career_ui':
        d.text((px(64), px(76)), 'CAREER PACK · AUTOMATED ROLE RESEARCH', font=font('uib', 34 * z), fill=TEXT_RGB)
        d.text((px(64), px(120)), 'Synced to LIVE Notion tracker + Code-Guard recruiter draft behind Default-NO', font=font('ui', 22 * z), fill=MUTED_RGB)
        roles = [
            ('01 · Staff AI Systems Engineer — Even Labs Track (94% FIT)', 'Smart eyewear + safety FSM + TypeScript · Staged for Notion Tracker', True),
            ('02 · Founding Applied AI Engineer — Edge Copilot Co (92% FIT)', 'Local Ollama + Agentic harness + Voice STT · Outreach drafted', False),
            ('03 · Wearable OS Engineer — Ambient Robotics (89% FIT)', 'Low-power HUD + zero-trust BLE gateway · Ready for review', False),
        ]
        for idx, (rt, rs, sel) in enumerate(roles):
            y0 = 178 + idx * 124
            d.rounded_rectangle(
                [px(64), px(y0), px(1396), px(y0 + 104)],
                radius=px(14),
                fill=(14, 42, 25) if sel else PANEL_RGB,
                outline=GREEN_RGB if sel else BORDER_RGB,
                width=max(1, px(2.5 if sel else 1.5)),
            )
            d.text((px(94), px(y0 + 16)), rt, font=font('uib', 25 * z), fill=GREEN_RGB if sel else TEXT_RGB)
            d.text((px(94), px(y0 + 58)), rs, font=font('mono', 20 * z), fill=MINT_RGB if sel else MUTED_RGB)
        d.rounded_rectangle([px(64), px(570), px(1396), px(715)], radius=px(14), fill=(10, 32, 19), outline=GREEN_RGB, width=max(1, px(2)))
        d.text((px(94), px(592)), 'CODE-GUARD OUTREACH DRAFT · ZERO BLIND SPAM (DEFAULT-NO)', font=font('mono', 20 * z), fill=GREEN_RGB)
        d.text((px(94), px(640)), '"Sharing my OnQ smart-glasses + agentic TypeScript portfolio (94% fit)."', font=font('ui', 24 * z), fill=TEXT_RGB)

    elif st == 'telegram_ui':
        d.text((px(64), px(76)), 'TELEGRAM CONTROL CENTER · @onq_g2_copilot_bot (LIVE)', font=font('uib', 34 * z), fill=TEXT_RGB)
        d.text((px(64), px(120)), 'Interactive /menu Control Center · Bot Studio · Watched-chat privacy · Kill Switch (423)', font=font('ui', 22 * z), fill=MUTED_RGB)
        rows = [
            ('[CONTROL CENTER] /menu Inline Dashboard', 'Morning Brief · PC Agents & AI · Bot Studio · PR Gate · Career Pack · Scheduler', True),
            ('[BOT STUDIO] /bot create PR Digest | 08:00 -> /code prep pr', 'Hands-free micro-bots behind L5 block + Default-NO approval gate', False),
            ('[PRIVACY GUARD] Watched Chats Only · Owner DM Gate', 'Zero privileged commands allowed in group chats; unread DMs stay private', False),
        ]
        for idx, (rt, rs, sel) in enumerate(rows):
            y0 = 178 + idx * 124
            d.rounded_rectangle(
                [px(64), px(y0), px(1396), px(y0 + 104)],
                radius=px(14),
                fill=(14, 42, 25) if sel else PANEL_RGB,
                outline=GREEN_RGB if sel else BORDER_RGB,
                width=max(1, px(2.5 if sel else 1.5)),
            )
            d.text((px(94), px(y0 + 16)), rt, font=font('uib', 25 * z), fill=GREEN_RGB if sel else TEXT_RGB)
            d.text((px(94), px(y0 + 58)), rs, font=font('mono', 20 * z), fill=MINT_RGB if sel else MUTED_RGB)
        d.rounded_rectangle([px(64), px(570), px(1396), px(715)], radius=px(14), fill=(10, 32, 19), outline=GREEN_RGB, width=max(1, px(2)))
        d.text((px(94), px(592)), 'GLOBAL KILL SWITCH · HTTP 423 LOCK', font=font('mono', 20 * z), fill=GREEN_RGB)
        d.text((px(94), px(640)), 'One tap halts all scheduled routines, Bot Studio runs, and paired glasses sessions.', font=font('ui', 24 * z), fill=TEXT_RGB)

    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    x0, y0 = (OW - sw) // 2, int(OH * 0.47 - sh / 2)
    bez = int(16 * S)
    cv2.rectangle(frame, (x0 - bez, y0 - bez), (x0 + sw + bez, y0 + sh + bez), (18, 36, 26), -1)
    glow_sm = cv2.GaussianBlur(cv2.rectangle(np.zeros((OH // 4, OW // 4, 3), np.uint8), (x0 // 4, y0 // 4), ((x0 + sw) // 4, (y0 + sh) // 4), (42, 160, 88), -1), (0, 0), max(1, int(12 * S)))
    cv2.addWeighted(frame, 1, cv2.resize(glow_sm, (OW, OH), interpolation=cv2.INTER_LINEAR), 0.22, 0, dst=frame)
    frame[y0:y0 + sh, x0:x0 + sw] = arr
    return frame


def draw_title(dst, shot, t):
    bgf = np.zeros((OH, OW, 3), np.uint8)
    draw_plates(bgf, 'balcony', (1120, 590, 1.2), 0, dict(shot, walk=False, dur=1), with_char=False)
    sm = cv2.GaussianBlur(cv2.resize(bgf, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA), (0, 0), 3.5)
    bgf = cv2.resize(sm, (OW, OH), interpolation=cv2.INTER_CUBIC)
    k = ease(t / 0.85) * ease((shot['dur'] - t) / 0.85)
    k_in = ease(t / 0.9)
    bgf = (bgf.astype(np.float32) * (0.54 - 0.28 * k_in)).astype(np.uint8)

    if k > 0.05:
        draw_voice_orb(bgf, OW // 2, int(OH * 0.16), 34, t, speaking=False)

    specs = (
        (TITLE[0], font('serif', 168), 0.34, TEXT_RGB),
        (TITLE[1], font('uib', 52), 0.51, TEXT_RGB),
        (TITLE[2], font('mono', 28), 0.60, GREEN_RGB),
        (TITLE[3], font('ui', 26), 0.70, MUTED_RGB),
        (TITLE[4], font('mono', 24), 0.78, MINT_RGB),
    )
    for n, (txt, fnt, y, col) in enumerate(specs):
        a = ease((t - 0.2 - n * 0.24) / 0.65) * ease((shot['dur'] - t) / 0.85)
        if a <= 0:
            continue
        im = text_rgba(txt, fnt, col, shadow=True, bg=None, pad=10)
        pm = pil_to_pm(im)
        h, w = pm.shape[:2]
        x, yy = max(0, (OW - w) // 2), int(OH * y - h / 2)
        wf, hf = min(w, OW - x), min(h, OH - yy)
        roi = bgf[yy:yy + hf, x:x + wf]
        over(roi, (pm[:hf, :wf].astype(np.float32) * a).astype(np.uint8))
        bgf[yy:yy + hf, x:x + wf] = roi
        if n == 0:
            bw = int(340 * S * ease((t - 0.45) / 0.65))
            cv2.rectangle(bgf, (OW // 2 - bw // 2, int(OH * 0.445)), (OW // 2 + bw // 2, int(OH * 0.445) + max(2, int(4 * S))), tuple(int(c * k) for c in GREEN), -1)
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
        post(f, i, 'desk', bloom=0.32)
    elif kind == 'lens':
        draw_lens(f, sh, t, i)
        post(f, i, 'bedroom', bloom=0.45, vignette=False)
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
    draw_caption(f, t, CLIP_LEN)
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
        for sec, label in [
            (9, '01_hand_grab'),
            (17, '02_lens_computer'),
            (30, '03_lens_draft'),
            (59, '04_lens_pr_gate'),
            (77, '05_street_walk'),
            (84, '06_lens_conflict'),
            (90, '07_screen_scribe'),
            (160, '08_title_lockup'),
        ]:
            cv2.imwrite(os.path.join(pdir, f'{label}.png'), render_frame(int(sec * FPS)))
        print(f'V5_PREVIEW_OK total={TOTAL}s frames={NFRAMES}')
        return

    wav = os.path.join(WORK, 'film_v5_audio.wav')
    stats = build_audio(wav)
    print('v5 audio:', stats, 'total %.1fs, %d frames' % (TOTAL, NFRAMES))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cmd = [
        _resolve_ffmpeg(), '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
        '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', '-', '-i', wav, '-c:v', 'libx264',
        '-preset', 'fast' if DRAFT else 'medium', '-crf', '23', '-maxrate', '4500k', '-bufsize', '9000k',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out_path,
    ]
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
