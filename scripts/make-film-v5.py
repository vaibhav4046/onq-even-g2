"""OnQ Flagship Launch Film v5 ("Day in the Life with OnQ" — Photorealistic Editorial Edition):
Real-world 16:9 editorial cinematography plates + strict in-lens Even G2 optical waveguide fit
+ real EvenHub Simulator 0.9.5 captures + OnQ Studio typography + living monochrome Voice Orb
+ AssemblyAI TTS-1 dual-voice + -16 LUFS mastered score.
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
PLATES = os.path.join(ROOT, 'media', 'film-v5-plates')
WORK = os.path.join(FILM, 'work')
CAPDIR = os.path.join(FILM, 'captures')
FPS = 30
DRAFT = '--draft' in sys.argv
S = 0.5 if DRAFT else 1.0
OW, OH = int(1920 * S), int(1080 * S)

# OnQ Studio palette (BGR for OpenCV, RGB for PIL)
GREEN_BGR = (126, 245, 52)    # #34f57e
GREEN_RGB = (52, 245, 126)    # #34f57e
MINT_RGB = (184, 255, 209)    # #b8ffd1
BG_RGB = (7, 10, 8)           # #070a08 obsidian matching OnQ website
PANEL_RGB = (14, 19, 16)      # #0e1310
BORDER_RGB = (29, 44, 35)     # #1d2c23
TEXT_RGB = (234, 243, 237)    # #eaf3ed
MUTED_RGB = (147, 166, 152)   # #93a698

PLATE_MAP = {
    'morning': '01-morning-desk.jpg',
    'desk': '02-coding-studio.jpg',
    'street': '03-city-corridor.jpg',
    'evening': '04-evening-commute.jpg',
}

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

# Non-overlapping dual-voice narration across 7 realistic workday acts (165.0s / 2:45)
CAPTIONS = [
    (1.2, VOICE_ONQ, '08:00 AM · Camera-free Even G2 glasses. Instant PC AI auto-sync.', 'Eight AM. You already own a computer running your AI tools.'),
    (8.0, VOICE_ONQ, 'OnQ turns your PC into the AI brain, and Even G2 into a quiet optical window.', 'OnQ turns your PC into the brain, and Even G2 into a quiet window you wear all day.'),
    (14.6, VOICE_ONQ, 'OnQ: "PC host synced. Ollama Qwen3, load balancer, and OpenBot ready at zero cost."', 'P C host synced. Ollama Qwen three, load balancer, and OpenBot ready at zero cost.'),
    (20.6, VOICE_WEARER, '08:15 AM · Wearer: "Show my morning brief, and mark Q4 deck review done."', 'Eight fifteen. Show my morning brief, and mark Q4 deck review done.'),
    (27.2, VOICE_ONQ, 'OnQ: "Notion task staged Default-NO. Tap YES for the 2-second undo ring."', 'Notion task staged Default-NO. Tap yes for the two-second undo ring, then done with a receipt.'),
    (36.5, VOICE_ONQ, 'OnQ: "Confirmed. Notion checked off; weather and morning schedule synced cleanly."', 'Confirmed. Notion checked off and morning schedule updated cleanly.'),
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
    return [
        # Act 1: 08:00 AM · Real Morning Desk & Instant PC Auto-Sync (0.0 -> 20.0s)
        ('cinema', 7.5, dict(
            plate='morning', zoom=(1.00, 1.07), pan=(0.0, -0.015), fade=0.8,
            kicker='08:00 AM · EVEN REALITIES G2 + R1 RING',
            headline='Your computer already runs your AI.',
            subline='OnQ mirrors your local PC agents onto a quiet 525nm optical lens.',
            orb=True, sfx=[(0.5, 'alarm')],
        )),
        ('cinema', 6.5, dict(
            plate='morning', zoom=(1.06, 1.12), pan=(0.02, -0.02), fade=0.45,
            kicker='LOCAL-FIRST AI POOL · $0 API TOKENS',
            headline='Ollama · OmniRoute · Claude · OpenBot.',
            subline='Adaptive load balancer with circuit breakers and automatic failover.',
            orb=True, sfx=[(0.4, 'whoosh'), (1.2, 'pair')],
        )),
        ('lens', 6.0, dict(
            slot='computer', plate='morning',
            tag='08:00 AM · PC AUTO-SYNC · LOAD BALANCER READY',
            icon='pc', orb=True, sfx=[(0.3, 'chime')],
        )),

        # Act 2: 08:15 AM · Morning Brief & Default-NO Undo Ring (20.0 -> 45.0s)
        ('cinema', 4.0, dict(
            plate='morning', zoom=(1.03, 1.08), pan=(-0.02, 0.0), fade=0.4,
            kicker='08:15 AM · VOICE COMMAND',
            headline='"Show my morning brief, and mark Q4 deck done."',
            subline='Zero clutter. Weather, time, calendar, mail, and Notion in one glance.',
            orb=True, wave=True, sfx=[(0.3, 'listen')],
        )),
        ('lens', 5.5, dict(
            slot='card', plate='morning',
            tag='08:15 AM · MORNING BRIEF · CAL + GMAIL + WEATHER',
            icon='calendar', orb=True, sfx=[(0.3, 'chime')],
        )),
        ('lens', 5.5, dict(
            slot='draft', plate='morning',
            tag='DEFAULT-NO PREVIEW · ZERO UNCONFIRMED WRITES',
            icon='shield', orb=True, sfx=[(0.3, 'chime')],
        )),
        ('lens', 5.0, dict(
            slot='ring', plate='morning',
            tag='2.0s 4-BIT GRAY4 UNDO RING · TAP TO ABORT',
            icon='ring', orb=False, sfx=[(0.4, 'tick'), (0.9, 'tick'), (1.4, 'tick'), (1.9, 'tick')],
        )),
        ('lens', 5.0, dict(
            slot='done', plate='morning',
            tag='RECEIPT COMMITTED · 30s SURGICAL UNDO READY',
            icon='check', orb=True, sfx=[(0.25, 'ding')],
        )),

        # Act 3: 10:30 AM · Real Engineering Studio & Coding PR Gate (45.0 -> 75.0s)
        ('cinema', 4.5, dict(
            plate='desk', zoom=(1.00, 1.07), pan=(0.01, -0.01), fade=0.45,
            kicker='10:30 AM · HANDS-FREE ENGINEERING',
            headline='"Run software crew and prep the PR for master."',
            subline='Runs directly on your home PC workstation over encrypted tunnel.',
            orb=True, wave=True, sfx=[(0.4, 'listen')],
        )),
        ('screen', 6.5, dict(state='term', plate='desk', sfx=[(0.2, 'whoosh')])),
        ('lens', 6.5, dict(
            slot='pr_gate', plate='desk',
            tag='10:30 AM · CODING PR GATE · L5 BLOCKS FORCE PUSH',
            icon='code', orb=True, sfx=[(0.3, 'chime')],
        )),
        ('lens', 6.5, dict(
            slot='summary', plate='desk',
            tag='L4 SPECIALIST CREW · 537 TESTS VERIFIED',
            icon='pc', orb=True, sfx=[(0.3, 'chime')],
        )),
        ('lens', 6.0, dict(
            slot='ring', plate='desk',
            tag='TELEGRAM + G2 SYNC · SINGLE-USE APPROVAL',
            icon='telegram', orb=False, sfx=[(0.4, 'tick'), (1.0, 'ding')],
        )),

        # Act 4: 13:48 PM · Real City Corridor Walk, 31ms 409 Lock & RAM Scribe (75.0 -> 102.0s)
        ('cinema', 4.5, dict(
            plate='street', zoom=(1.00, 1.08), pan=(0.0, 0.01), fade=0.45,
            kicker='13:48 PM · BETWEEN MEETINGS',
            headline='"Move investor sync to 14:45 and reply to thread."',
            subline='Deterministic conflict check runs before any AI model touches a calendar.',
            orb=True, wave=True, sfx=[(0.4, 'notify')],
        )),
        ('lens', 7.5, dict(
            slot='conflict', plate='street',
            tag='31ms HTTP 409 CONFLICT LOCK · 0 LLM CALLS',
            icon='lock', orb=True, sfx=[(0.3, 'kill')],
        )),
        ('screen', 6.5, dict(state='voice_scribe', plate='street', sfx=[(0.2, 'whoosh'), (0.8, 'chime')])),
        ('lens', 8.5, dict(
            slot='video', plate='street',
            tag='LIVE MEETING SCRIBE · RAM-ONLY · EARBUDS TTS-1',
            icon='orb', orb=True, sfx=[(0.3, 'chime')],
        )),

        # Act 5: 16:00 PM · Remote Tunnel & Career Pack (102.0 -> 130.0s)
        ('cinema', 4.5, dict(
            plate='street', zoom=(1.04, 1.10), pan=(-0.02, 0.0), fade=0.45,
            kicker='16:00 PM · REMOTE WORKSTATION CONTROL',
            headline='"Run career pack for AI Engineer roles."',
            subline='Researcher and Career Operator run on your PC while you are in the city.',
            orb=True, wave=True, sfx=[(0.4, 'listen')],
        )),
        ('screen', 7.5, dict(state='career_ui', plate='street', sfx=[(0.2, 'whoosh'), (0.8, 'notify')])),
        ('lens', 8.5, dict(
            slot='career', plate='street',
            tag='CAREER PACK · NOTION TRACKER + CODE-GUARD DRAFT',
            icon='notion', orb=True, sfx=[(0.3, 'chime')],
        )),
        ('lens', 7.5, dict(
            slot='ring', plate='street',
            tag='HUMAN GATE · ZERO BLIND SPAM · DEFAULT-NO',
            icon='shield', orb=False, sfx=[(0.4, 'tick'), (1.0, 'ding')],
        )),

        # Act 6: 18:30 PM · Evening Commute, Telegram Control Center & Kill Switch (130.0 -> 148.0s)
        ('screen', 6.0, dict(state='telegram_ui', plate='evening', sfx=[(0.2, 'whoosh'), (0.8, 'notify')])),
        ('lens', 6.0, dict(
            slot='recap', plate='evening',
            tag='18:30 PM · EVENING RECAP · ALL WRITES AUDITED',
            icon='telegram', orb=True, sfx=[(0.3, 'chime')],
        )),
        ('lens', 6.0, dict(
            slot='killswitch', plate='evening',
            tag='GLOBAL KILL SWITCH · HTTP 423 PAUSES ALL AGENTS',
            icon='lock', orb=True, sfx=[(0.3, 'kill')],
        )),

        # Act 7: Evening Skyline & Grand OnQ Lockup (148.0 -> 165.0s)
        ('cinema', 5.0, dict(
            plate='evening', zoom=(1.00, 1.07), pan=(0.0, -0.01), fade=0.55,
            kicker='PRIVATE · REVERSIBLE · LOCAL-FIRST',
            headline='Everything your computer can do, at a glance.',
            subline='AES-256-GCM encrypted local vault. Zero cloud middleman.',
            orb=True, sfx=[],
        )),
        ('title', 12.0, dict(plate='evening', fade=0.65)),
    ]


SHOTS = []
_t0 = 0.0
for kind, dur, p in _shots():
    SHOTS.append(dict(kind=kind, t0=_t0, t1=_t0 + dur, dur=dur, **p))
    _t0 += dur
TOTAL = _t0
NFRAMES = int(round(TOTAL * FPS))

_cache = {}
CLIP_LEN = {}


def font(name, size):
    fname = {
        'ui': 'segoeuisb.ttf',
        'uib': 'segoeuib.ttf',
        'mono': 'consola.ttf',
        'monob': 'consolab.ttf',
        'serif': 'georgiab.ttf',
        'light': 'segoeuisl.ttf',
    }[name]
    p = 'C:/Windows/Fonts/' + fname
    if not os.path.exists(p):
        p = 'C:/Windows/Fonts/segoeuib.ttf'
    return ImageFont.truetype(p, max(8, int(round(size * S))))


def load_plate(plate_key):
    key = ('plate', plate_key, OW, OH)
    if key not in _cache:
        p = os.path.join(PLATES, PLATE_MAP[plate_key])
        im = cv2.imread(p, cv2.IMREAD_COLOR)
        if im is None:
            raise FileNotFoundError(f'Missing photorealistic plate: {p}')
        # Pre-upscale with slight 1.16x overscan for crisp Ken Burns zooms
        tw, th = int(OW * 1.16), int(OH * 1.16)
        up = cv2.resize(im, (tw, th), interpolation=cv2.INTER_LANCZOS4)
        # Subtle editorial obsidian-emerald cinema color grade
        f = up.astype(np.float32)
        f[..., 0] *= 0.96  # B
        f[..., 1] *= 1.02  # G
        f[..., 2] *= 0.96  # R
        _cache[key] = np.clip(f, 0, 255).astype(np.uint8)
    return _cache[key]


def sample_plate(plate_key, zoom_a, zoom_b, pan_x, pan_y, k):
    src = load_plate(plate_key)
    sh, sw = src.shape[:2]
    z = lerp(zoom_a, zoom_b, k)
    cw = min(sw, int(round(OW / z)))
    ch = min(sh, int(round(OH / z)))
    cx = sw * 0.5 + pan_x * sw * k
    cy = sh * 0.5 + pan_y * sh * k
    x0 = int(max(0, min(sw - cw, round(cx - cw / 2))))
    y0 = int(max(0, min(sh - ch, round(cy - ch / 2))))
    crop = src[y0:y0 + ch, x0:x0 + cw]
    return cv2.resize(crop, (OW, OH), interpolation=cv2.INTER_LINEAR)


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


def pil_to_pm(im):
    a = np.array(im).astype(np.float32)
    bgra = np.dstack([a[..., 2], a[..., 1], a[..., 0], a[..., 3]])
    bgra[..., :3] *= bgra[..., 3:4] / 255.0
    return bgra.astype(np.uint8)


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
    """STRICT IN-LENS FIT: 576x288 simulator capture scaled to 1.62*S (933x466 px on 1080p)
    so it sits cleanly inside the realistic matte-titanium Even G2 lens aperture with zero rim spill.
    """
    key = ('hud_v5', slot, S)
    if key not in _cache:
        cap = get_capture(slot)
        lum = cv2.cvtColor(cap, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        lum = np.maximum(lum, cap.max(2).astype(np.float32) / 255.0 * 0.94)
        k = 1.62 * S
        big = np.clip(cv2.resize(lum, (int(round(576 * k)), int(round(288 * k))), interpolation=cv2.INTER_CUBIC), 0, 1)
        # Subtle micro-LED scanlines
        rows = np.arange(big.shape[0])
        big *= (1.0 - 0.10 * ((rows // max(1, int(round(2 * S)))) % 2))[:, None]
        g = np.dstack([big * GREEN_BGR[0], big * GREEN_BGR[1], big * GREEN_BGR[2]]).astype(np.uint8)
        # Subtle delicate waveguide reticle corners (strictly inside HUD bounds, no overhang)
        hh, ww = g.shape[:2]
        L = int(20 * S)
        fr = np.zeros_like(g)
        for (x, y, dx, dy) in ((0, 0, 1, 1), (ww - 1, 0, -1, 1), (0, hh - 1, 1, -1), (ww - 1, hh - 1, -1, -1)):
            cv2.line(fr, (x, y), (x + dx * L, y), GREEN_BGR, max(1, int(2 * S)))
            cv2.line(fr, (x, y), (x, y + dy * L), GREEN_BGR, max(1, int(2 * S)))
        _cache[key] = cv2.add(g, (fr.astype(np.float32) * 0.42).astype(np.uint8))
    return _cache[key]


def lens_aperture_overlay():
    """Realistic thin matte-titanium Even Realities G2 rectangular-panto spectacle aperture (superellipse p=3.4).
    Safe inner optical area: ~1520x770 px on 1920x1080 — HUD (933x466) sits comfortably inside with >220px margins!
    """
    key = ('lens_aperture', S)
    if key not in _cache:
        yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
        cx, cy = OW * 0.50, OH * 0.475
        rx, ry = OW * 0.44, OH * 0.395
        p = 3.4
        d = (np.abs((xx - cx) / rx) ** p + np.abs((yy - cy) / ry) ** p) ** (1.0 / p)
        outside = np.clip((d - 0.965) / 0.045, 0.0, 1.0)
        # Subtle peripheral frame darkening outside the glasses rim
        a = np.clip(outside * 246.0, 0, 246)
        inner_vig = np.clip((d - 0.72) / 0.28, 0.0, 1.0) ** 2.0 * 78.0
        a = np.maximum(a, inner_vig * (1.0 - outside))
        ov = np.zeros((OH, OW, 4), np.float32)
        frame_col = np.array([14, 16, 15], np.float32)  # matte obsidian titanium
        ov[..., :3] = frame_col * (a[..., None] / 255.0)
        ov[..., 3] = a
        # Delicate brushed-titanium optical rim specular highlight
        rim = np.exp(-((d - 0.972) / 0.0085) ** 2)
        ang = np.arctan2(yy - cy, xx - cx)
        spec = 0.28 + 0.55 * (np.clip(np.cos(ang + 2.15), 0, 1) ** 3)
        ov[..., :3] += (rim * spec * 185.0)[..., None] * np.array([0.85, 0.96, 0.88], np.float32)
        ov[..., 3] = np.maximum(ov[..., 3], rim * spec * 185.0)
        # Ultra-subtle diagonal anti-reflective green coating sheen on glass
        sheen = np.exp(-(((xx - cx) * 0.55 + (yy - cy) * 0.85 + 310 * S) / (75 * S)) ** 2) * np.clip(1.0 - d, 0, 1) * 14.0
        _cache[key] = (np.clip(ov, 0, 255).astype(np.uint8), np.clip(sheen, 0, 255).astype(np.uint8))
    return _cache[key]


def draw_voice_orb(dst, cx, cy, radius, t, speaking=False):
    """Minimal Meta-style monochrome-green glowing Voice Orb rendered cleanly inside lens or hero bottom."""
    r = max(10, int(radius * S))
    cx, cy = int(cx), int(cy)
    layer = np.zeros((OH, OW, 3), np.uint8)
    pulse = 1.0 + (0.14 if speaking else 0.06) * math.sin(t * (7.5 if speaking else 2.8))
    rc = int(r * 0.55 * pulse)
    # Soft outer acoustic halo
    cv2.circle(layer, (cx, cy), int(r * pulse), (48, 128, 30), max(1, int(2 * S)), cv2.LINE_AA)
    # Rotating tilted energy ellipse filament
    ang = (t * (55 if speaking else 24)) % 360
    cv2.ellipse(layer, (cx, cy), (int(r * 0.92), int(r * 0.44)), ang, 0, 360, GREEN_BGR, max(1, int(2 * S)), cv2.LINE_AA)
    cv2.ellipse(layer, (cx, cy), (int(r * 0.86), int(r * 0.36)), -ang * 0.7 + 45, 0, 360, (180, 255, 196), max(1, int(1.5 * S)), cv2.LINE_AA)
    # Core luminescent ring
    cv2.circle(layer, (cx, cy), rc, GREEN_BGR, max(2, int(2.5 * S)), cv2.LINE_AA)
    cv2.circle(layer, (cx, cy), max(3, rc // 3), (200, 255, 215), -1, cv2.LINE_AA)
    if speaking:
        for bi in range(-2, 3):
            bh = int((6 + 10 * abs(math.sin(t * 9.5 + bi * 1.1))) * S)
            bx = cx + int(bi * 8 * S)
            by = cy + r + int(14 * S)
            cv2.line(layer, (bx, by - bh // 2), (bx, by + bh // 2), GREEN_BGR, max(1, int(3 * S)), cv2.LINE_AA)
    glow = cv2.GaussianBlur(layer, (0, 0), max(3, int(9 * S)))
    cv2.addWeighted(dst, 1.0, glow, 0.55, 0, dst=dst)
    cv2.addWeighted(dst, 1.0, layer, 0.95, 0, dst=dst)


def draw_app_badge_glyph(dst, icon_kind, cx, cy, t):
    """Crisp monochrome-green vector app icon badge placed strictly inside the top-left of the waveguide zone."""
    sz = int(34 * S)
    x0, y0 = int(cx - sz // 2), int(cy - sz // 2)
    im = Image.new('RGBA', (sz, sz), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    g = (52, 245, 126, 235)
    g_soft = (52, 245, 126, 90)
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
        # PC / shield / default clean diamond node
        d.ellipse([m, m, sz - m, sz - m], outline=g, width=w)
        d.ellipse([sz // 2 - int(3 * S), sz // 2 - int(3 * S), sz // 2 + int(3 * S), sz // 2 + int(3 * S)], fill=g)
    pm = pil_to_pm(im)
    roi = dst[y0:y0 + sz, x0:x0 + sz]
    over(roi, pm)
    dst[y0:y0 + sz, x0:x0 + sz] = roi


def draw_cinema(dst, shot, t):
    """Photorealistic editorial shot with subtle Ken Burns motion + clean OnQ Studio typography."""
    k = ease(t / shot['dur'])
    za, zb = shot.get('zoom', (1.0, 1.06))
    px, py = shot.get('pan', (0.0, 0.0))
    frame = sample_plate(shot['plate'], za, zb, px, py, k)

    # Subtle cinematic dark gradient vignette at bottom-left for high-contrast editorial typography
    yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
    grad_b = np.clip((yy - OH * 0.42) / (OH * 0.58), 0.0, 1.0) ** 1.35 * 0.72
    grad_l = np.clip((OW * 0.62 - xx) / (OW * 0.62), 0.0, 1.0) * 0.32
    dim = np.clip(1.0 - np.maximum(grad_b, grad_l * 0.65), 0.24, 1.0)
    frame = (frame.astype(np.float32) * dim[..., None]).astype(np.uint8)

    # Editorial OnQ typography card (top-left kicker + clean lower-third headline above caption safe zone)
    alpha = min(ease(t / 0.45), ease((shot['dur'] - t) / 0.4))
    if alpha > 0.02:
        ov_im = Image.new('RGBA', (OW, OH), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov_im)
        kicker = shot.get('kicker', '')
        headline = shot.get('headline', '')
        subline = shot.get('subline', '')
        lx = int(86 * S)
        # Top-left pill matching OnQ web badge
        if kicker:
            kf = font('mono', 22)
            kb = d.textbbox((0, 0), kicker, font=kf)
            kw, kh = kb[2] - kb[0], kb[3] - kb[1]
            ky = int(52 * S)
            d.rounded_rectangle(
                [lx, ky, lx + kw + int(34 * S), ky + kh + int(18 * S)],
                radius=int(18 * S),
                fill=(10, 28, 17, int(205 * alpha)),
                outline=(52, 245, 126, int(145 * alpha)),
                width=max(1, int(1.5 * S)),
            )
            d.text((lx + int(17 * S), ky + int(8 * S) - kb[1]), kicker, font=kf, fill=GREEN_RGB + (int(255 * alpha),))
        # Lower-left editorial headline (kept safely ABOVE bottom subtitle safe zone: y ~ 695-820)
        if headline:
            hf = font('uib', 52 if len(headline) <= 44 else 44)
            hy = int(685 * S + (1.0 - alpha) * 14 * S)
            d.text((lx + int(2 * S), hy + int(3 * S)), headline, font=hf, fill=(0, 0, 0, int(190 * alpha)))
            d.text((lx, hy), headline, font=hf, fill=TEXT_RGB + (int(255 * alpha),))
        if subline:
            sf = font('ui', 27)
            sy = int(756 * S + (1.0 - alpha) * 14 * S)
            d.text((lx + int(1 * S), sy + int(2 * S)), subline, font=sf, fill=(0, 0, 0, int(175 * alpha)))
            d.text((lx, sy), subline, font=sf, fill=MUTED_RGB + (int(245 * alpha),))
        over(frame, pil_to_pm(ov_im))

    if shot.get('orb'):
        draw_voice_orb(frame, OW - int(115 * S), int(92 * S), 28, t + shot['t0'], speaking=bool(shot.get('wave')))
    dst[:] = frame


def draw_lens(dst, shot, t):
    """Photorealistic Even G2 wearer POV shot with STRICT in-lens waveguide fit (ZERO rim overhang)."""
    k = ease(t / shot['dur'])
    world = sample_plate(shot['plate'], 1.02, 1.07, 0.0, 0.0, k)
    # Soft natural optical defocus of real-world background behind the waveguide focus plane
    sm = cv2.GaussianBlur(cv2.resize(world, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA), (0, 0), 3.6)
    bgb = (cv2.resize(sm, (OW, OH), interpolation=cv2.INTER_CUBIC).astype(np.float32) * 0.52).astype(np.uint8)

    hud = hud_layer(shot['slot'])
    hh, ww = hud.shape[:2]
    k_in = ease(t / 0.42)
    flick = 1.0 if t > 0.35 else (0.86 + 0.14 * math.sin(t * 70)) * k_in
    # Subtle micro-breathing strictly bounded to +/- 3px so HUD never approaches lens rim
    dx = int(round(3 * S * math.sin(t * 0.55)))
    dy = int(round(3 * S * math.sin(t * 0.85)))
    x = OW // 2 - ww // 2 + dx
    y = int(OH * 0.455) - hh // 2 + dy

    # Translucent dark waveguide optical field ONLY behind the HUD (fits cleanly inside lens!)
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

    # Composite crisp 525nm monochrome HUD + realistic subtle optical phosphor bloom
    layer = np.zeros((OH, OW, 3), np.uint8)
    layer[y:y + hh, x:x + ww] = (hud.astype(np.float32) * flick).astype(np.uint8)
    if t < 0.55:
        sy = int(y + hh * (t / 0.55))
        cv2.rectangle(layer, (x, max(0, sy - int(1.5 * S))), (x + ww, sy + int(1.5 * S)), tuple(int(c * 0.55) for c in GREEN_BGR), -1)

    l_sm = cv2.resize(layer, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA)
    g1 = cv2.resize(cv2.GaussianBlur(l_sm, (0, 0), 2.2 * S), (OW, OH), interpolation=cv2.INTER_LINEAR)
    g2 = cv2.resize(cv2.GaussianBlur(l_sm, (0, 0), 7.5 * S), (OW, OH), interpolation=cv2.INTER_LINEAR)
    cv2.addWeighted(bgb, 1.0, layer, 1.0, 0, dst=bgb)
    cv2.addWeighted(bgb, 1.0, g1, 0.24, 0, dst=bgb)
    cv2.addWeighted(bgb, 1.0, g2, 0.12, 0, dst=bgb)

    # Crisp monochrome app glyph strictly inside the upper-left optical safe margin + Voice Orb strictly inside bottom center of lens!
    if shot.get('icon'):
        draw_app_badge_glyph(bgb, shot['icon'], x - int(42 * S), y + int(22 * S), t)
    if shot.get('orb'):
        draw_voice_orb(bgb, OW // 2, y + hh + int(52 * S), 24, t + shot['t0'], speaking=True)

    # Apply realistic Even G2 matte-titanium spectacle aperture frame OVER the world+HUD
    ov, sheen = lens_aperture_overlay()
    over(bgb, ov)
    cv2.add(bgb, cv2.merge([sheen, sheen, sheen]), dst=bgb)

    # Clean non-overlapping cinema metadata pills in top frame margin (strictly outside optical glass)
    tag = shot.get('tag')
    if tag:
        tm = pil_to_pm(text_rgba(tag, font('mono', 19), color=MINT_RGB, shadow=False, pad=10, bg=(8, 22, 14, 215), border=(52, 245, 126, 110), radius=8))
        th, tw = tm.shape[:2]
        tx, ty = int(38 * S), int(22 * S)
        roi = bgb[ty:ty + th, tx:tx + tw]
        over(roi, tm)
        bgb[ty:ty + th, tx:tx + tw] = roi

    bkey = ('simbadge_v5', S)
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
    """OnQ Studio companion interface card matching exact OnQ website dark obsidian aesthetic (ZERO cartoon anime)."""
    st = shot['state']
    dur = shot['dur']
    k = ease(t / dur)
    world = sample_plate(shot['plate'], 1.0, 1.04, 0.0, 0.0, k)
    sm = cv2.GaussianBlur(cv2.resize(world, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA), (0, 0), 5.0)
    frame = (cv2.resize(sm, (OW, OH), interpolation=cv2.INTER_CUBIC).astype(np.float32) * 0.34).astype(np.uint8)

    z = lerp(1.0, 1.035, k)
    sw, sh = int(1460 * S * z), int(790 * S * z)
    img = Image.new('RGB', (sw, sh), BG_RGB)
    d = ImageDraw.Draw(img)
    px = lambda v: int(v * S * z)

    # Top bar matching OnQ Studio web app
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
        nch = int(t * 76)
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
        # Sleek geometric concentric Voice Orb inside left panel (NO cartoon anime face!)
        cx_, cy_, r = px(280), px(435), px(142)
        for ri, col in [(r, (24, 86, 48)), (int(r * 0.78), (38, 152, 82)), (int(r * 0.54), GREEN_RGB)]:
            pulse = 1.0 + 0.08 * math.sin(t * 6.5 + ri * 0.03)
            rr = int(ri * pulse)
            d.ellipse([cx_ - rr, cy_ - rr, cx_ + rr, cy_ + rr], outline=col, width=max(2, px(3)))
        d.ellipse([cx_ - px(32), cy_ - px(32), cx_ + px(32), cy_ + px(32)], fill=(18, 92, 48), outline=MINT_RGB, width=max(2, px(2)))
        # Audio spectrum bars
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
        d.text((px(64), px(120)), 'Synced to Notion tracker + Code-Guard recruiter draft behind Default-NO', font=font('ui', 22 * z), fill=MUTED_RGB)
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
        d.text((px(64), px(76)), 'TELEGRAM CONTROL CENTER · @onq_g2_copilot_bot', font=font('uib', 34 * z), fill=TEXT_RGB)
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
    bez = int(14 * S)
    cv2.rectangle(frame, (x0 - bez, y0 - bez), (x0 + sw + bez, y0 + sh + bez), (22, 36, 28), -1)
    frame[y0:y0 + sh, x0:x0 + sw] = arr
    return frame


def draw_title(dst, shot, t):
    """Grand Apple/OnQ website-matched closing lockup on twilight editorial backdrop."""
    k_pan = ease(t / shot['dur'])
    bgf = sample_plate(shot['plate'], 1.0, 1.08, 0.0, -0.015, k_pan)
    sm = cv2.GaussianBlur(cv2.resize(bgf, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA), (0, 0), 4.0)
    bgf = cv2.resize(sm, (OW, OH), interpolation=cv2.INTER_CUBIC)
    k = ease(t / 0.85) * ease((shot['dur'] - t) / 0.85)
    k_in = ease(t / 0.9)
    bgf = (bgf.astype(np.float32) * (0.48 - 0.24 * k_in)).astype(np.uint8)

    # Subtle pulsing monochrome Voice Orb crest above wordmark
    if k > 0.05:
        draw_voice_orb(bgf, OW // 2, int(OH * 0.16), 34, t, speaking=False)

    specs = (
        (TITLE[0], font('serif', 164), 0.34, TEXT_RGB),
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
            cv2.rectangle(bgf, (OW // 2 - bw // 2, int(OH * 0.445)), (OW // 2 + bw // 2, int(OH * 0.445) + max(2, int(4 * S))), tuple(int(c * k) for c in GREEN_BGR), -1)
    dst[:] = bgf


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
            # Bottom cinema safe margin: strictly below lens aperture & cinema headlines (zero overlap!)
            y = max(0, int(OH - 26 * S - h + (1.0 - a) * 10 * S))
            wf = min(w, OW - x)
            hf = min(h, OH - y)
            roi = dst[y:y + hf, x:x + wf]
            over(roi, im[:hf, :wf], a)
            dst[y:y + hf, x:x + wf] = roi
            return


def shot_at(t):
    for sh in SHOTS:
        if sh['t0'] <= t < sh['t1']:
            return sh
    return SHOTS[-1]


def render_shot(sh, t):
    f = np.zeros((OH, OW, 3), np.uint8)
    kind = sh['kind']
    if kind == 'cinema':
        draw_cinema(f, sh, t)
    elif kind == 'lens':
        draw_lens(f, sh, t)
    elif kind == 'screen':
        f[:] = screen_frame(sh, t)
    elif kind == 'title':
        draw_title(f, sh, t)
    return f


def render_frame(i):
    t = i / FPS
    sh = shot_at(t)
    lt = t - sh['t0']
    f = render_shot(sh, lt)
    idx = SHOTS.index(sh)
    fade = sh.get('fade', 0.42)
    if lt < fade and idx > 0:
        prev = SHOTS[idx - 1]
        pf = render_shot(prev, prev['dur'] - 1e-3 + lt)
        k = ease(lt / fade)
        f = cv2.addWeighted(pf, 1.0 - k, f, k, 0)
    elif lt < fade and idx == 0:
        f = (f.astype(np.float32) * ease(lt / fade)).astype(np.uint8)
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
    return au.mix(ROOT, WORK, TOTAL, SCENES, sfx, clips, _resolve_ffmpeg(), out_wav)


def _init_worker(clip_len):
    CLIP_LEN.update(clip_len)
    cv2.setNumThreads(1)


def _work(i):
    return render_frame(i).tobytes()


def main():
    t_start = time.time()
    ensure_captures()
    out_path = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'media', 'out', 'onq-film-v5-day-in-life.mp4')

    if '--preview' in sys.argv:
        pdir = os.path.join(FILM, 'preview-v5')
        os.makedirs(pdir, exist_ok=True)
        for sec, label in [
            (3, '01_morning_cinema'),
            (17, '02_lens_computer'),
            (30, '03_lens_draft'),
            (52, '04_screen_pr'),
            (59, '05_lens_pr_gate'),
            (84, '06_lens_conflict'),
            (90, '07_screen_scribe'),
            (132, '08_screen_telegram'),
            (160, '09_title_lockup'),
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
