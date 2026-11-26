"""OnQ demo film v3: hand-authored anime-style SVG plates -> cv2 2.5D compositor -> ffmpeg.
Run from the repo root in PowerShell:  python scripts/make-film-v3.py [--preview] [--draft] [--force-layers] [--out PATH]
  --preview  one still per scene (character shot + lens shot) in media/film-v3/preview/
  --draft    540p fast render to media/film-v3/work/onq-film-v3-draft.mp4
  (none)     full 1080p -> media/out/onq-film-v3.mp4
HUD captures: media/film-v3/captures.json maps slot -> PNG under media/film-v3/captures/ (read at render time)."""
import importlib.util, json, math, os, subprocess, sys, time
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
C0 = (1152.0, 648.0)  # world rest centre of the 2304x1296 plates
GREEN = (126, 245, 52)  # BGR of #34f57e

# ------------------------------------------------------------------ timeline
SCENES = [
    ('wake', 0.0, 17.5),
    ('pair', 17.5, 31.5),
    ('morning', 31.5, 55.5),
    ('telegram', 55.5, 84.5),
    ('coding', 84.5, 111.5),
    ('talk', 111.5, 137.5),
    ('recap', 137.5, 160.0),
]
SLOTS = ['pair', 'card', 'draft', 'ring', 'done', 'telegram', 'coding', 'summary', 'video', 'recap', 'killswitch']
# (start_sec, voice_id, subtitle_text, spoken_text)
VOICE_WEARER = 'aai-kyla'
VOICE_ONQ = 'aai-titus'
CAPTIONS = [
    (3.0, VOICE_WEARER, 'Wearer: "Morning. Let me put on and pair the glasses."', 'Morning. Let me put on and pair the glasses.'),
    (18.2, VOICE_ONQ, 'OnQ: "Paired to your computer. Zero accounts stored on your lenses."', 'Paired to your computer. Zero accounts stored on your lenses.'),
    (32.2, VOICE_WEARER, 'Wearer: "What is waiting in my morning brief?"', 'What is waiting in my morning brief?'),
    (36.0, VOICE_ONQ, 'OnQ: "Investor call at two, priority email on Q4 metrics. Draft ready."', 'Investor call at two, priority email on Q4 metrics. Draft ready.'),
    (43.2, VOICE_WEARER, 'Wearer: "Push fifteen and confirm."', 'Push fifteen and confirm.'),
    (46.2, VOICE_ONQ, 'OnQ: "Two-second undo ring armed. Calendar moved and reply sent."', 'Two-second undo ring armed. Calendar moved and reply sent.'),
    (56.5, VOICE_ONQ, 'OnQ: "Founders Telegram group asks for Q4 metrics and the glasses build."', 'Founders Telegram group asks for Q4 metrics and the glasses build.'),
    (63.2, VOICE_WEARER, 'Wearer: "Stage a reply for watched groups only."', 'Stage a reply for watched groups only.'),
    (67.2, VOICE_ONQ, 'OnQ: "Staged Default-NO on your lens. Confirm with a single tap."', 'Staged Default-NO on your lens. Confirm with a single tap.'),
    (74.8, VOICE_WEARER, 'Wearer: "Looks right. Send it."', 'Looks right. Send it.'),
    (85.4, VOICE_WEARER, 'Wearer: "How is our repo pull request looking?"', 'How is our repo pull request looking?'),
    (89.6, VOICE_ONQ, 'OnQ: "Tests pass with one open review note. Prompt suggestions ready."', 'Tests pass with one open review note. Prompt suggestions ready.'),
    (98.5, VOICE_WEARER, 'Wearer: "Stage the PR recap for afternoon check-in."', 'Stage the PR recap for afternoon check-in.'),
    (112.4, VOICE_WEARER, 'Wearer: "OnQ, compare our two Friday launch plans while I walk."', 'OnQ, compare our two Friday launch plans while I walk.'),
    (118.0, VOICE_ONQ, 'OnQ: "Plan A ships today with real simulator proof; staying hands-free."', 'Plan A ships today with real simulator proof; staying hands-free.'),
    (128.8, VOICE_WEARER, 'Wearer: "Keep Plan A ready and remind me at four."', 'Keep Plan A ready and remind me at four.'),
    (138.6, VOICE_ONQ, 'OnQ: "Evening recap: one committed write, zero unconfirmed sends."', 'Evening recap: one committed write, zero unconfirmed sends.'),
    (150.2, VOICE_ONQ, 'OnQ. Your computer, on your glasses.', 'OnQ. Your computer, on your glasses.'),
]
TITLE = ('OnQ.', 'Your computer, on your glasses.', 'Verified in the Even Hub simulator · 24/7 Local Relay')


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, k):
    return a + (b - a) * k


# shot = (kind, dur, dict). Starts are cumulative.
def _shots():
    R = 'room'
    return [
        # 1. wake (0.0 -> 17.5s)
        (R, 7.5, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-4), cam=((1152, 700, 1.0), (1160, 690, 1.16)), fade=1.2, vignette=0.55,
                      keys=[(0, 'sleep', 0, 0), (5.0, 'neutral', 0, 0), (6.5, 'neutral', 0, -1)], sfx=[(4.8, 'alarm')], motes=True, speed=[(5.1, 5.5)])),
        ('night', 6.0, dict(sfx=[(0.2, 'whoosh')])),
        (R, 4.0, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-4), cam=((1160, 720, 1.25), (1140, 640, 1.65)), fade=0.35,
                      keys=[(0, 'neutral', 0, 0), (0.6, 'neutral', 1, 0), (1.8, 'smile', 1, 0)], flash=0.6, glow=[(1.2, 4.0, 0.8)], motes=True)),
        # 2. pair (17.5 -> 31.5s)
        ('screen', 4.5, dict(state='code', sfx=[(0.2, 'whoosh')])),
        ('lens', 5.0, dict(slot='pair', bg='desk', cam=((1300, 560, 1.0), (1300, 560, 1.05)), iris=(1000, 380), sfx=[(0.4, 'chime'), (1.2, 'pair')])),
        ('screen', 4.5, dict(state='paired', sfx=[(0.2, 'pair')])),
        # 3. morning brief + email + send (31.5 -> 55.5s)
        (R, 4.0, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-3), cam=((1150, 690, 1.22), (1150, 690, 1.18)), fade=0.4,
                      keys=[(0, 'focused', 1, 0)], talk=[(0.6, 3.2)], glow=[(0, 4.0, 0.5)], sfx=[(0.4, 'listen')], wave=(0.6, 3.2))),
        ('lens', 5.0, dict(slot='card', bg='bedroom', toast='MAIL: Priority · Q4 Metrics v3', cam=((1500, 520, 1.0), (1500, 520, 1.08)), iris=(1000, 380), sfx=[(0.4, 'chime'), (1.6, 'notify')])),
        ('lens', 5.0, dict(slot='draft', bg='bedroom', cam=((1500, 520, 1.04), (1500, 520, 1.1)), iris=None, sfx=[(0.4, 'chime')])),
        ('lens', 4.0, dict(slot='ring', bg='bedroom', cam=((1500, 520, 1.08), (1500, 520, 1.12)), iris=(1000, 380),
                           sfx=[(0.4, 'tick'), (0.9, 'tick'), (1.4, 'tick'), (1.9, 'tick')])),
        ('lens', 3.5, dict(slot='done', bg='bedroom', cam=((1500, 520, 1.1), (1500, 520, 1.14)), iris=None, sfx=[(0.3, 'ding')])),
        (R, 2.5, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-3), cam=((1150, 690, 1.25), (1152, 660, 1.0)), fade=0.35,
                      keys=[(0, 'smile', 1, 0)], motes=True, glow=[(0, 1.5, 0.4)])),
        # 4. telegram groups & DM (55.5 -> 84.5s)
        (R, 5.5, dict(bg='street', walk=True, k=0.12, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.0), (1152, 640, 1.08)), fade=0.5, strt=0.55,
                      keys=[(0, 'neutral', 1, 0), (1.0, 'surprised', 1, 0), (3.0, 'focused', 1, 0)], sfx=[(1.0, 'notify')], glow=[(1.0, 5.5, 0.7)], talk=[(1.4, 4.0)], wave=(1.4, 4.0))),
        ('screen', 6.5, dict(state='telegram_ui', sfx=[(0.2, 'whoosh'), (1.2, 'notify')])),
        ('lens', 7.0, dict(slot='telegram', bg='street', toast='TG WATCH · Founders Group (+3)', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 5.0, dict(slot='ring', bg='street', cam=((1500, 520, 1.06), (1500, 520, 1.1)), iris=None, sfx=[(0.4, 'tick'), (0.9, 'tick')])),
        (R, 5.0, dict(bg='street', walk=True, k=0.25, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 640, 1.08), (1152, 648, 1.0)), fade=0.4, strt=0.55,
                      keys=[(0, 'smile', 1, 0)], talk=[(0.2, 2.5)], sfx=[(0.4, 'ding')], glow=[(0, 2.0, 0.5)], speed=[(0.2, 0.7)])),
        # 5. coding & PR suggestions (84.5 -> 111.5s)
        (R, 5.0, dict(bg='desk', char=dict(x=900, y=640, s=1.15, rot=-2), cam=((1152, 600, 1.0), (1100, 590, 1.1)), fade=0.5,
                      keys=[(0, 'focused', 1, 1)], talk=[(0.8, 3.8)], glow=[(0, 5.0, 0.45)], sfx=[(0.6, 'listen')], wave=(0.8, 3.8), motes=True)),
        ('screen', 7.5, dict(state='term', sfx=[(0.2, 'whoosh')])),
        ('lens', 6.0, dict(slot='coding', bg='desk', cam=((1300, 560, 1.0), (1300, 560, 1.05)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 5.0, dict(slot='summary', bg='desk', cam=((1300, 560, 1.05), (1300, 560, 1.09)), iris=None, sfx=[(0.4, 'chime')])),
        (R, 3.5, dict(bg='desk', char=dict(x=900, y=640, s=1.15, rot=-2), cam=((1100, 590, 1.1), (1152, 620, 1.0)), fade=0.4,
                      keys=[(0, 'smile', 1, 0)], talk=[(0.2, 2.2)], motes=True)),
        # 6. hands-free lunch AI talk + talking avatar (111.5 -> 137.5s)
        (R, 6.0, dict(bg='street', walk=True, k=0.5, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.0), (1152, 648, 1.08)), fade=0.5,
                      keys=[(0, 'neutral', 1, 0), (1.0, 'focused', 1, 0)], talk=[(0.8, 4.5)], sfx=[(0.8, 'listen')], glow=[(0, 6.0, 0.55)], wave=(0.8, 4.5))),
        ('screen', 7.0, dict(state='avatar', sfx=[(0.2, 'whoosh'), (1.0, 'chime')])),
        ('lens', 7.5, dict(slot='video', bg='street', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        (R, 5.5, dict(bg='street', walk=True, k=0.72, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.06), (1152, 648, 1.0)), fade=0.45,
                      keys=[(0, 'smile', 1, 0)], talk=[(0.5, 3.0)], speed=[(0.1, 0.55)], sfx=[(0.3, 'ding')])),
        # 7. evening recap & killswitch (137.5 -> 160.0s)
        (R, 5.5, dict(bg='balcony', char=dict(x=1060, y=700, s=1.15, rot=0), cam=((1152, 670, 1.0), (1120, 650, 1.1)), fade=0.65,
                      keys=[(0, 'neutral', 1, 0), (3.0, 'smile', 1, 0)], motes=True)),
        ('lens', 6.5, dict(slot='recap', bg='balcony', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.4, 'chime')])),
        ('lens', 5.0, dict(slot='killswitch', bg='balcony', cam=((1500, 520, 1.0), (1500, 520, 1.05)), iris=(1000, 380), sfx=[(0.4, 'kill')])),
        ('title', 5.5, dict(bg='balcony')),
    ]


SHOTS = []
_t0 = 0.0
for kind, dur, p in _shots():
    SHOTS.append(dict(kind=kind, t0=_t0, t1=_t0 + dur, dur=dur, **p))
    _t0 += dur
TOTAL = _t0
NFRAMES = int(round(TOTAL * FPS))

# ------------------------------------------------------------------ assets
_cache = {}
MAN = None
BGR_TINT = {  # Balanced emerald anime lighting grade
    'bedroom': (0.98, 1.04, 0.94), 'street': (0.98, 1.04, 0.94), 'desk': (0.96, 1.04, 0.94), 'balcony': (0.98, 1.04, 0.94),
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
    im[..., :3] *= a  # premultiply
    if tint:
        im[..., :3] *= np.array(tint, np.float32)
    im = np.clip(im, 0, 255).astype(np.uint8)
    if len(_cache) > 140:
        for k in list(_cache)[:40]:
            _cache.pop(k)
    _cache[key] = im
    return im


def over(dst, src, opacity=1.0):
    # Vectorized uint8-safe premultiplied alpha composite avoiding full-frame float32 allocations.
    if opacity <= 0:
        return
    a = src[..., 3]
    s = src[..., :3]
    if opacity < 1.0:
        a = (a.astype(np.uint16) * int(round(opacity * 256)) >> 8).astype(np.uint8)
        s = cv2.multiply(s, (opacity, opacity, opacity, 1.0)) if opacity < 0.999 else s
    inv = (255 - a)
    inv3 = cv2.merge([inv, inv, inv])
    bg_part = cv2.multiply(dst, inv3, scale=1.0 / 255.0)
    cv2.add(bg_part, s, dst=dst)


def add(dst, src, k=1.0):
    s = src[..., :3] if src.shape[2] == 4 else src
    if k != 1.0:
        s = (s.astype(np.float32) * k).astype(np.uint8)
    cv2.add(dst, s, dst=dst)


def warp(img, M, a_only=False):
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

# per-scene layer stacks: (plate, parallax, mode) ; 'CHAR' marks the character slot
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
            cx = start - v * p * t
            cx = min(max(cx, 960), Wp - 960)
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


# ------------------------------------------------------------------ character
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


def spr_M(ax_s, ay_s, wx, wy, z, rot, s, cam_c, S_=None):
    """matrix mapping sprite px (anchor ax_s,ay_s) to screen px: anchor lands on world point (wx,wy)."""
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
    # screen-fixed (walk / street stand) vs world-fixed (rooms)
    pc = 0.0 if bg == 'street' else 1.0
    cam_c = eff(cam, pc) if pc else (C0[0], C0[1], 1 + (cam[2] - 1) * 0.6)
    bob = 0.0
    sway = 0.0
    if walk:
        ph = 2 * math.pi * 1.9 * t
        bob = -abs(math.sin(ph)) * 13 + 6
        sway = 1.6 * math.sin(ph)
    wx, wy = cfg['x'], cfg['y'] + bob + 1.8 * math.sin(2 * math.pi * t / 4.0)
    s = cfg['s']
    rot = cfg['rot'] + sway
    hrot = rot + 1.4 * math.sin(0.9 * t + shot['t0']) + (-2.0 * look) + (1.5 * math.sin(2 * math.pi * 1.9 * t + 1) if walk else 0)
    if expr == 'sleep':
        hrot += 3
    # scale the (1.0-res) sprites down for draft via S inside spr_M; sprites loaded at scale 1.0
    bi = spr_M(man['body']['ax'], man['body']['ay'], wx, wy, 1, rot, s * 1.14, cam_c)
    hi = spr_M(man['head']['ax'], man['head']['ay'], wx, wy + 2, 1, hrot, s, cam_c)
    over(dst, warp(bodyi, bi))
    over(dst, warp(hd, hi))
    # HUD lens glow + glint on the near lens
    glow = sum(v for a, b, v in shot.get('glow', []) if a <= t < b) if shot.get('glow') else 0
    flash = shot.get('flash')
    fl = 0.0
    if flash is not None and abs(t - flash) < 0.35:
        fl = 1 - abs(t - flash) / 0.35
    if glow > 0 or fl > 0:
        lx, ly = man['head']['lens']
        pt = hi @ np.array([lx, ly, 1.0], np.float32)
        layer = np.zeros((OH, OW, 3), np.uint8)
        pulse = 0.75 + 0.25 * math.sin(t * 5)
        cv2.ellipse(layer, (int(pt[0]), int(pt[1])), (int(70 * s * cam_c[2] * S), int(58 * s * cam_c[2] * S)), 0, 0, 360, tuple(int(c * glow * pulse * 0.42) for c in GREEN), -1)
        layer = cv2.GaussianBlur(layer, (0, 0), 14 * S * s)
        if fl > 0:
            cv2.circle(layer, (int(pt[0]), int(pt[1])), int(34 * S * s * cam_c[2] * (1 + fl)), (int(255 * fl), int(255 * fl), int(255 * fl)), -1)
            layer = cv2.GaussianBlur(layer, (0, 0), 10 * S)
        add(dst, layer)
    return pt if (glow > 0 or fl > 0) else None


# ------------------------------------------------------------------ post fx
_post = {}


def post_masks(bg):
    if bg in _post:
        return _post[bg]
    yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
    r = np.sqrt(((xx - OW / 2) / (OW * 0.62)) ** 2 + ((yy - OH / 2) / (OH * 0.68)) ** 2)
    vig = np.clip(1.08 - 0.42 * r ** 2.2, 0.45, 1.05)
    m = np.stack([vig] * 3, -1) * 128
    m = np.clip(m, 0, 255).astype(np.uint8)
    _post[bg] = m
    return m


def noise_bank():
    if 'noise' not in _post:
        rng = np.random.default_rng(3)
        _post['noise'] = [np.clip(rng.normal(0, 4.5, (OH, OW)), 0, 12).astype(np.uint8) for _ in range(6)]
    return _post['noise']


def post(dst, i, bg='bedroom', bloom=0.35, grain=1.0, vignette=True):
    small = cv2.resize(dst, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA)
    hi = cv2.subtract(small, np.full_like(small, 212))
    hi = cv2.GaussianBlur(hi, (0, 0), 8)
    up = cv2.resize(hi, (OW, OH), interpolation=cv2.INTER_LINEAR)
    cv2.addWeighted(dst, 1.0, up, bloom * 1.15, 0, dst=dst)
    if vignette:
        dst[:] = cv2.multiply(dst, post_masks(bg), scale=1 / 128.0)
    if grain:
        nb = noise_bank()[i % 6]
        dx, dy = (i * 37) % OW, (i * 91) % OH
        n = np.roll(nb, (dy, dx), (0, 1))
        cv2.add(dst, cv2.merge([n, n, n]), dst=dst)


def speed_lines(dst, t, a, b):
    k = math.sin(math.pi * min(1, max(0, (t - a) / (b - a)))) if a <= t <= b else 0
    if k <= 0:
        return
    rng = np.random.default_rng(int(t * 14))
    m = np.zeros((OH, OW), np.uint8)
    cx, cy = OW // 2, int(OH * 0.46)
    diag = math.hypot(OW, OH)
    for _ in range(46):
        ang = rng.uniform(0, 2 * math.pi)
        r0 = diag * rng.uniform(0.34, 0.5)
        r1 = diag * rng.uniform(0.55, 0.75)
        w = rng.uniform(0.004, 0.012)
        p0 = (cx + r0 * math.cos(ang), cy + r0 * math.sin(ang))
        p1 = (cx + r1 * math.cos(ang + w), cy + r1 * math.sin(ang + w))
        p2 = (cx + r1 * math.cos(ang - w), cy + r1 * math.sin(ang - w))
        cv2.fillConvexPoly(m, np.array([p0, p1, p2], np.int32), 255, cv2.LINE_AA)
    m = cv2.GaussianBlur(m, (0, 0), 1.2 * S)
    add(dst, cv2.merge([m, m, m]), 0.5 * k)


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
    layer = cv2.GaussianBlur(layer, (0, 0), 1.3 * S)
    add(dst, layer, 0.9)


def wave_bars(dst, t, a, b, pt):
    """small phosphor-green mic waveform next to the glasses while she speaks"""
    if not (a <= t < b):
        return
    layer = np.zeros((OH, OW, 3), np.uint8)
    x0, y0 = int((960 + 360) * S), int(330 * S)
    ramp = min(1, (t - a) / 0.25, (b - t) / 0.25)
    for i in range(9):
        h = (8 + 36 * abs(math.sin(t * 9 + i * 1.3) * math.sin(t * 3.1 + i))) * S * ramp
        x = x0 + int(i * 15 * S)
        cv2.line(layer, (x, int(y0 - h)), (x, int(y0 + h)), GREEN, max(2, int(6 * S)), cv2.LINE_AA)
    add(dst, cv2.GaussianBlur(layer, (0, 0), 7 * S), 0.9)
    add(dst, layer, 0.9)


# ------------------------------------------------------------------ fonts / text
def font(name, size):
    path = {'ui': 'segoeuisb.ttf', 'uib': 'segoeuib.ttf', 'mono': 'consola.ttf', 'monob': 'consolab.ttf', 'serif': 'georgiab.ttf', 'bah': 'bahnschrift.ttf', 'light': 'segoeuisl.ttf'}[name]
    for d in ('C:/Windows/Fonts/',):
        p = d + path
        if os.path.exists(p):
            return ImageFont.truetype(p, max(8, int(size * S)))
        p = d + 'segoeuib.ttf'
    return ImageFont.truetype(p, int(size * S))


def text_rgba(txt, fnt, color=(255, 255, 255), shadow=True, pad=24, bg=(14, 18, 34, 150), radius=26):
    tmp = Image.new('RGBA', (10, 10))
    d = ImageDraw.Draw(tmp)
    box = d.textbbox((0, 0), txt, font=fnt)
    w, h = box[2] - box[0], box[3] - box[1]
    pw, ph = int(pad * S * 1.4), int(pad * S * 0.7)
    im = Image.new('RGBA', (w + 2 * pw, h + 2 * ph + int(10 * S)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=int(radius * S), fill=bg)
    if shadow:
        d.text((pw - box[0] + 2 * S, ph - box[1] + 3 * S), txt, font=fnt, fill=(0, 0, 0, 160))
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
        bg = (6, 28, 16, 185) if voice == VOICE_ONQ else (10, 20, 16, 175)
        _capcache[i] = pil_to_pm(text_rgba(sub_txt, font('ui', 44), color=col, bg=bg))
    return _capcache[i]


def draw_caption(dst, t, clip_len, low=False):
    for i, (t0, _, _, _) in enumerate(CAPTIONS):
        d = clip_len.get(i, 2.5)
        t1 = t0 + d + 0.55
        if t0 - 0.15 <= t <= t1 + 0.35:
            a = min(ease((t - (t0 - 0.15)) / 0.35), ease((t1 + 0.35 - t) / 0.35))
            im = caption_layer(i)
            h, w = im.shape[:2]
            x = (OW - w) // 2
            y = int(OH - (46 if low else 140) * S - h + (1 - a) * 18 * S)
            roi = dst[y:y + h, x:x + w]
            tmp = im
            if a < 1:
                tmp = (im.astype(np.float32) * a).astype(np.uint8)
            over(roi, tmp)
            dst[y:y + h, x:x + w] = roi
            return


# ------------------------------------------------------------------ captures + lens POV
def read_captures():
    mf = os.path.join(FILM, 'captures.json')
    return json.load(open(mf))['slots']


def get_capture(slot):
    key = ('cap', slot)
    if key not in _cache:
        rel = read_captures()[slot]
        p = rel if os.path.isabs(rel) else os.path.join(FILM, rel)
        im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
        if im is None:
            im = np.zeros((288, 576, 3), np.uint8)
        elif im.ndim == 3 and im.shape[2] == 4:
            # Composite RGBA simulator captures cleanly over pure #000000 black so alpha never leaks raw flood fill.
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
    """green monochrome HUD (576x288 scaled to the lens), returns (sharp, glow) BGR uint8"""
    key = ('hud', slot, S)
    if key not in _cache:
        cap = get_capture(slot)
        lum = cv2.cvtColor(cap, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        lum = np.maximum(lum, cap.max(2).astype(np.float32) / 255.0 * 0.9)
        k = 2.6 * S
        big = cv2.resize(lum, (int(576 * k), int(288 * k)), interpolation=cv2.INTER_CUBIC)
        big = np.clip(big, 0, 1)
        # scanlines
        rows = np.arange(big.shape[0])
        big *= (1 - 0.16 * ((rows // max(1, int(round(2 * S)))) % 2))[:, None]
        g = np.dstack([big * GREEN[0], big * GREEN[1], big * GREEN[2]]).astype(np.uint8)
        # frame ticks marking the 576x288 display area
        fr = np.zeros_like(g)
        hh, ww = g.shape[:2]
        L = int(46 * S)
        for (x, y, dx, dy) in ((0, 0, 1, 1), (ww - 1, 0, -1, 1), (0, hh - 1, 1, -1), (ww - 1, hh - 1, -1, -1)):
            cv2.line(fr, (x, y), (x + dx * L, y), GREEN, max(1, int(3 * S)))
            cv2.line(fr, (x, y), (x, y + dy * L), GREEN, max(1, int(3 * S)))
        g = cv2.add(g, (fr.astype(np.float32) * 0.55).astype(np.uint8))
        _cache[key] = g
    return _cache[key]


def lens_overlay():
    key = ('lensov', S)
    if key in _cache:
        return _cache[key]
    yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
    cx, cy = OW / 2, OH * 0.5
    rx, ry = OW * 0.50, OH * 0.52
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    outside = np.clip((d - 0.93) / 0.07, 0, 1)
    a = np.clip(outside * 255, 0, 255) * 0.97
    # soft inner darkening toward the lens edge
    inner = np.clip((d - 0.55) / 0.4, 0, 1) ** 1.6 * 0.55 * 255
    a = np.maximum(a, inner * (1 - outside))
    col = np.array([36, 24, 22], np.float32)  # near-black with a cool-purple cast
    ov = np.zeros((OH, OW, 4), np.float32)
    ov[..., :3] = col * (a[..., None] / 255.0)
    ov[..., 3] = a
    # glass rim highlights (top-left arc) + glare streak
    rim = np.exp(-((d - 0.935) / 0.012) ** 2)
    ang = np.arctan2(yy - cy, xx - cx)
    arc = np.clip(np.cos(ang + 2.3), 0, 1) ** 4
    ov[..., :3] += (rim * arc * 255 * 0.9)[..., None] * np.array([1.0, 0.96, 0.9], np.float32)
    ov[..., 3] = np.maximum(ov[..., 3], rim * arc * 255 * 0.9)
    glare = np.exp(-(((xx - cx) * 0.6 + (yy - cy) * 0.8 + 380 * S) / (60 * S)) ** 2) * np.clip(1 - d, 0, 1) * 18
    out = np.clip(ov, 0, 255).astype(np.uint8)
    out2 = np.clip(glare, 0, 255).astype(np.uint8)
    _cache[key] = (out, out2)
    return _cache[key]


def draw_lens(dst, shot, t, i):
    bg = shot['bg']
    cam = camera(shot, t)
    world = np.zeros((OH, OW, 3), np.uint8)
    sub = dict(shot, walk=False, scroll_v=0, k=0.6)
    draw_plates(world, bg, cam, 0.0, sub, with_char=False)
    sm = cv2.resize(world, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA)
    sm = cv2.GaussianBlur(sm, (0, 0), 4.0)
    bgb = cv2.resize(sm, (OW, OH), interpolation=cv2.INTER_CUBIC)
    bgb = (bgb.astype(np.float32) * 0.48).astype(np.uint8)
    # HUD
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
    # Subtle notification toast banner when active (email/telegram notification)
    toast = shot.get('toast')
    if toast and t > 0.6:
        ta = ease((t - 0.6) / 0.35)
        tw = int(520 * S)
        th = int(42 * S)
        tx0 = int(OW / 2 - tw / 2)
        ty0 = max(int(18 * S), y - th - int(18 * S))
        cv2.rectangle(layer, (tx0, ty0), (tx0 + tw, ty0 + th), (24, 96, 44), -1)
        cv2.rectangle(layer, (tx0, ty0), (tx0 + tw, ty0 + th), GREEN, max(1, int(2 * S)))
        im_t = text_rgba(toast, font('mono', 22), color=(184, 255, 209), shadow=False, pad=6, bg=None)
        pm_t = pil_to_pm(im_t)
        ph, pw = pm_t.shape[:2]
        tx_i = tx0 + max(8, (tw - pw) // 2)
        ty_i = ty0 + max(2, (th - ph) // 2)
        roi = layer[ty_i:ty_i + ph, tx_i:tx_i + pw]
        if roi.shape[:2] == (ph, pw):
            over(roi, pm_t, ta)
            layer[ty_i:ty_i + ph, tx_i:tx_i + pw] = roi
    # Scan sweep on boot
    if t < 0.75:
        sy = int(y + h2 * (t / 0.75))
        cv2.rectangle(layer, (x, max(0, sy - int(2 * S))), (x + w2, sy + int(2 * S)), tuple(int(c * 0.7) for c in GREEN), -1)
    # 1/4-res optical phosphor glow (crisp text + restrained bloom, zero whiteout)
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
    dst[:] = bgb


# ------------------------------------------------------------------ laptop screen inserts (PIL)
def screen_frame(shot, t):
    st = shot['state']
    dur = shot['dur']
    key = ('scrbg', S)
    if key not in _cache:
        w = load('desk_back', BGR_TINT['desk'], S)
        w = cv2.warpAffine(w, layer_M(1152, 700, 1.0), (OW, OH))
        bg = np.zeros((OH, OW, 3), np.uint8)
        bg[:] = (40, 52, 96)
        over(bg, w)
        small = cv2.resize(bg, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (0, 0), 5)
        _cache[key] = (cv2.resize(small, (OW, OH), interpolation=cv2.INTER_CUBIC) * 0.55).astype(np.uint8)
    frame = _cache[key].copy()
    z = lerp(1.0, 1.07, ease(t / dur))
    sw, sh = int(1500 * S * z), int(860 * S * z)
    img = Image.new('RGB', (sw, sh), (14, 18, 24))
    d = ImageDraw.Draw(img)
    px = lambda v: int(v * S * z)
    d.rectangle([0, 0, sw, px(46)], fill=(26, 32, 42))
    for i, c in enumerate(((255, 96, 92), (255, 189, 68), (52, 199, 89))):
        d.ellipse([px(22 + i * 26), px(15), px(36 + i * 26), px(29)], fill=c)
    d.text((px(660), px(8)), 'OnQ Host', font=font('ui', 24 * z), fill=(150, 165, 175))
    if st in ('code', 'paired'):
        code = '4 8 2   9 1 7'
        d.text((px(140), px(120)), 'Pair your glasses' if st == 'code' else 'Glasses connected', font=font('uib', 54 * z), fill=(216, 255, 228))
        d.text((px(140), px(200)), 'Scan QR or enter single-use code · zero credentials stored on lenses.' if st == 'code' else 'Paired to this computer · encrypted local vault active.', font=font('light', 30 * z), fill=(134, 210, 165))
        shown = int(min(1, max(0, (t - 0.5) / 1.8)) * 6) if st == 'code' else 6
        x = 140
        digits = [c for c in code if c != ' ']
        fnt = font('monob', 170 * z)
        for n, c in enumerate(digits):
            if n == 3:
                x += 70
            a = n < shown or st == 'paired'
            col = (52, 245, 126) if a else (22, 48, 34)
            d.text((px(x), px(300)), c if a else '-', font=fnt, fill=col)
            x += 150
        if st == 'code':
            dots = '.' * (1 + int(t * 2) % 3)
            d.text((px(140), px(600)), 'Waiting for glasses handshake' + dots, font=font('mono', 32 * z), fill=(120, 175, 145))
        else:
            k = ease((t - 0.2) / 0.5)
            cx_, cy_, r = px(300), px(660), int(px(52) * k)
            d.ellipse([cx_ - r, cy_ - r, cx_ + r, cy_ + r], outline=(52, 245, 126), width=max(2, px(6)))
            if k > 0.6:
                d.line([cx_ - px(24), cy_, cx_ - px(6), cy_ + px(20), cx_ + px(28), cy_ - px(20)], fill=(52, 245, 126), width=max(2, px(8)))
            d.text((px(390), px(630)), 'Ready · Default-NO write gate armed', font=font('light', 34 * z), fill=(160, 230, 185))
    elif st == 'telegram_ui':
        d.text((px(80), px(86)), 'TELEGRAM GROUPS & WATCHED CHATS', font=font('uib', 40 * z), fill=(52, 245, 126))
        d.rounded_rectangle([px(1080), px(82), px(1420), px(132)], radius=px(18), fill=(12, 46, 28), outline=(52, 245, 126), width=max(1, px(2)))
        d.text((px(1105), px(94)), 'OWNER WRITE GUARD', font=font('mono', 24 * z), fill=(134, 255, 175))
        chats = [
            ('[WATCHED] Founders Group · 3 new', 'Investor asks: Share Q4 metrics + OnQ .ehpk', True),
            ('[WATCHED] Build Release Alerts', 'CI green on master · 0 console errors', False),
            ('[MUTED] Public Community Lobby', 'Group privacy guard: ignore unsolicited cmds', False),
        ]
        for idx, (title_c, sub_c, sel) in enumerate(chats):
            y0 = 176 + idx * 145
            fill_c = (12, 38, 24) if sel else (10, 22, 16)
            out_c = (52, 245, 126) if sel else (26, 60, 42)
            d.rounded_rectangle([px(80), px(y0), px(1420), px(y0 + 122)], radius=px(16), fill=fill_c, outline=out_c, width=max(1, px(3 if sel else 1)))
            d.text((px(112), px(y0 + 20)), title_c, font=font('uib', 30 * z), fill=(134, 255, 175) if sel else (165, 200, 180))
            d.text((px(112), px(y0 + 68)), sub_c, font=font('mono', 26 * z), fill=(220, 245, 228) if sel else (120, 155, 138))
        if t > 1.2:
            d.rounded_rectangle([px(80), px(626), px(1420), px(792)], radius=px(16), fill=(8, 30, 18), outline=(134, 255, 175), width=max(1, px(3)))
            d.text((px(112), px(648)), 'STAGED REPLY (DEFAULT-NO · SENT TO GLASSES)', font=font('mono', 26 * z), fill=(52, 245, 126))
            d.text((px(112), px(698)), '"Metrics attached — sharing fresh simulator .ehpk next."   [TAP R1 TO SEND]', font=font('ui', 28 * z), fill=(228, 252, 236))
    elif st == 'term':
        d.text((px(70), px(76)), 'CODING · PR STATUS & PROMPT SUGGESTIONS', font=font('uib', 38 * z), fill=(52, 245, 126))
        lines = [
            ('$ onq repo pr-status --branch master', (200, 230, 210)),
            ('branch   master · clean build · 0 TS errors', (134, 210, 165)),
            ('tests    PASS  All Vitest & Eval suites green', (52, 245, 126)),
            ('pr #42   1 review note -> stage summary on G2', (184, 255, 209)),
        ]
        fnt = font('mono', 34 * z)
        y = 148
        nch = int(t * 68)
        for txt, col in lines:
            if nch <= 0:
                break
            d.text((px(70), px(y)), txt[:nch], font=fnt, fill=col)
            nch -= len(txt) + 4
            y += 72
        # Suggested prompt chips
        d.text((px(70), px(470)), 'SUGGESTED PROMPTS READY ON GLASSES:', font=font('mono', 26 * z), fill=(134, 255, 175))
        chips = ['Stage PR recap', 'Draft reviewer reply', 'Check evening diff']
        for ci, ch_lbl in enumerate(chips):
            cx0 = 70 + ci * 440
            sel_c = ci == 0 and t > 2.2
            d.rounded_rectangle([px(cx0), px(526), px(cx0 + 410), px(612)], radius=px(14),
                                fill=(16, 62, 36) if sel_c else (12, 28, 20),
                                outline=(52, 245, 126) if sel_c else (42, 92, 62), width=max(1, px(3 if sel_c else 2)))
            d.text((px(cx0 + 26), px(552)), '> ' + ch_lbl, font=font('mono', 28 * z), fill=(184, 255, 209) if sel_c else (150, 200, 170))
        d.text((px(70), px(690)), 'Output stays read-only until wearer taps R1.', font=font('light', 30 * z), fill=(134, 185, 155))
    elif st == 'avatar':
        d.text((px(70), px(82)), 'ONQ VOICE PARTNER · HANDS-FREE CONVERSATION', font=font('uib', 38 * z), fill=(52, 245, 126))
        # Styled Shonen Anime Avatar matching OnQVoiceOrb.tsx (spiky hair + collar + eyes + viseme mouth)
        cx_, cy_, r = px(320), px(460), px(176)
        d.ellipse([cx_ - r, cy_ - r, cx_ + r, cy_ + r], fill=(4, 18, 10), outline=(52, 245, 126), width=max(2, px(4)))
        # Coat & high collar
        d.polygon([
            (cx_ - px(108), cy_ + px(136)), (cx_ - px(74), cy_ + px(58)),
            (cx_ - px(34), cy_ + px(42)), (cx_ + px(34), cy_ + px(42)),
            (cx_ + px(74), cy_ + px(58)), (cx_ + px(108), cy_ + px(136)),
        ], fill=(10, 46, 23), outline=(52, 245, 126), width=max(2, px(3)))
        # Spiky hair back crown
        d.polygon([
            (cx_ - px(96), cy_ - px(4)), (cx_ - px(120), cy_ - px(46)), (cx_ - px(82), cy_ - px(62)),
            (cx_ - px(98), cy_ - px(108)), (cx_ - px(46), cy_ - px(94)), (cx_ - px(36), cy_ - px(136)),
            (cx_, cy_ - px(104)), (cx_ + px(28), cy_ - px(140)), (cx_ + px(44), cy_ - px(94)),
            (cx_ + px(96), cy_ - px(108)), (cx_ + px(80), cy_ - px(62)), (cx_ + px(118), cy_ - px(46)),
            (cx_ + px(96), cy_ - px(4)),
        ], fill=(6, 31, 16), outline=(52, 245, 126), width=max(2, px(3)))
        # Jaw & face
        d.polygon([
            (cx_ - px(64), cy_ - px(44)), (cx_ + px(64), cy_ - px(44)),
            (cx_ + px(60), cy_ + px(18)), (cx_ + px(24), cy_ + px(56)),
            (cx_, cy_ + px(64)), (cx_ - px(24), cy_ + px(56)), (cx_ - px(60), cy_ + px(18)),
        ], fill=(13, 59, 30), outline=(52, 245, 126), width=max(2, px(3)))
        # Sharp shonen eyes + brows
        d.line([(cx_ - px(52), cy_ - px(24)), (cx_ - px(14), cy_ - px(16))], fill=(184, 255, 209), width=max(2, px(4)))
        d.line([(cx_ + px(52), cy_ - px(24)), (cx_ + px(14), cy_ - px(16))], fill=(184, 255, 209), width=max(2, px(4)))
        d.polygon([(cx_ - px(48), cy_ - px(10)), (cx_ - px(16), cy_ - px(6)), (cx_ - px(20), cy_ + px(8)), (cx_ - px(44), cy_ + px(6))], fill=(4, 18, 10), outline=(52, 245, 126), width=max(1, px(2)))
        d.polygon([(cx_ + px(48), cy_ - px(10)), (cx_ + px(16), cy_ - px(6)), (cx_ + px(20), cy_ + px(8)), (cx_ + px(44), cy_ + px(6))], fill=(4, 18, 10), outline=(52, 245, 126), width=max(1, px(2)))
        d.ellipse([cx_ - px(36), cy_ - px(7), cx_ - px(22), cy_ + px(7)], fill=(52, 245, 126))
        d.ellipse([cx_ + px(22), cy_ - px(7), cx_ + px(36), cy_ + px(7)], fill=(52, 245, 126))
        # Front bangs
        d.polygon([
            (cx_ - px(68), cy_ - px(28)), (cx_ - px(50), cy_ - px(64)), (cx_ - px(34), cy_ - px(30)),
            (cx_ - px(12), cy_ - px(68)), (cx_, cy_ - px(24)), (cx_ + px(14), cy_ - px(68)),
            (cx_ + px(34), cy_ - px(30)), (cx_ + px(50), cy_ - px(64)), (cx_ + px(68), cy_ - px(28)),
            (cx_ + px(56), cy_ - px(78)), (cx_, cy_ - px(94)), (cx_ - px(56), cy_ - px(78)),
        ], fill=(6, 31, 16), outline=(52, 245, 126), width=max(1, px(2)))
        # Animated speaking mouth viseme
        mh = px(6 + 18 * abs(math.sin(t * 10)))
        d.rounded_rectangle([cx_ - px(22), cy_ + px(30) - mh // 2, cx_ + px(22), cy_ + px(30) + mh // 2], radius=px(8), fill=(4, 18, 10), outline=(134, 255, 175), width=max(1, px(2)))
        # Waveform bars
        for bi in range(18):
            bh = px(18 + 72 * abs(math.sin(t * 7 + bi * 0.6)))
            bx = px(560 + bi * 46)
            d.rectangle([bx, px(660) - bh, bx + px(28), px(660)], fill=(52, 245, 126) if bi % 2 == 0 else (134, 255, 175))
        d.rounded_rectangle([px(560), px(230), px(1420), px(480)], radius=px(20), fill=(10, 34, 20), outline=(52, 245, 126), width=max(1, px(3)))
        d.text((px(600), px(270)), 'ONQ (TTS-1 VOICE)', font=font('mono', 26 * z), fill=(52, 245, 126))
        d.text((px(600), px(330)), '"Plan A ships today with verified', font=font('ui', 34 * z), fill=(224, 252, 234))
        d.text((px(600), px(384)), 'simulator proof. Staying hands-free."', font=font('ui', 34 * z), fill=(224, 252, 234))
    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    # Bezel + fast 1/4-res emerald glow
    x0, y0 = (OW - sw) // 2, int(OH * 0.5 - sh / 2)
    bez = int(26 * S)
    cv2.rectangle(frame, (x0 - bez, y0 - bez), (x0 + sw + bez, y0 + sh + bez), (18, 36, 26), -1)
    glow_sm = np.zeros((OH // 4, OW // 4, 3), np.uint8)
    cv2.rectangle(glow_sm, (x0 // 4, y0 // 4), ((x0 + sw) // 4, (y0 + sh) // 4), (42, 160, 88), -1)
    glow_sm = cv2.GaussianBlur(glow_sm, (0, 0), max(1, int(12 * S)))
    glow = cv2.resize(glow_sm, (OW, OH), interpolation=cv2.INTER_LINEAR)
    cv2.addWeighted(frame, 1, glow, 0.24, 0, dst=frame)
    frame[y0:y0 + sh, x0:x0 + sw] = arr
    return frame


# ------------------------------------------------------------------ title + night hand
def draw_title(dst, shot, t):
    bgf = np.zeros((OH, OW, 3), np.uint8)
    cam = (1120, 590, 1.2)
    draw_plates(bgf, 'balcony', cam, 0, dict(shot, walk=False, dur=1), with_char=False)
    sm = cv2.resize(bgf, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA)
    sm = cv2.GaussianBlur(sm, (0, 0), 3.5)
    bgf = cv2.resize(sm, (OW, OH), interpolation=cv2.INTER_CUBIC)
    k = ease(t / 0.9) * ease((shot['dur'] - t) / 0.9)
    k_in = ease(t / 0.9)
    bgf = (bgf.astype(np.float32) * (0.62 - 0.30 * k_in)).astype(np.uint8)
    for n, (txt, fnt, y, col) in enumerate((
            (TITLE[0], font('serif', 190), 0.36, (240, 245, 244)),
            (TITLE[1], font('uib', 60), 0.56, (225, 232, 238)),
            (TITLE[2], font('light', 34), 0.88, (170, 185, 195)))):
        a = ease((t - 0.3 - n * 0.35) / 0.8) * ease((shot['dur'] - t) / 0.9)
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
            # phosphor accent bar under the wordmark
            bw = int(380 * S * ease((t - 0.6) / 0.8))
            cv2.rectangle(bgf, (OW // 2 - bw // 2, int(OH * 0.47)), (OW // 2 + bw // 2, int(OH * 0.47) + max(2, int(5 * S))), tuple(int(c * k) for c in GREEN), -1)
    dst[:] = bgf


def draw_night(dst, shot, t):
    cam = (330 + 14 * math.sin(t), 800, 2.5 + 0.12 * ease(t / shot['dur']))
    cam = (lerp(520, 360, ease(t / 2.5)), 800, cam[2])
    grab = 3.0
    mid = 'bedroom_mid' if t < grab else 'bedroom_mid_noG2'
    draw_plates_bed_night(dst, cam, mid)
    # hand sprite: approach (no glasses) -> grab -> lift with glasses
    sc = cam[2]
    if t > 0.6:
        hand = 'hand' if t < grab else 'hand_g2'
        tint = BGR_TINT['bedroom']
        im = load(hand, tint, 1.0)
        man = manifest()
        k1 = ease((t - 0.6) / 2.2)
        k2 = ease((t - grab) / 2.2)
        # world position of the fingertip anchor
        wx = lerp(1150, 390, k1) if t < grab else lerp(390, 520, k2)
        wy = lerp(900, 800, k1) if t < grab else lerp(800, 380, k2)
        if t >= grab + 1.6:
            wx += (t - grab - 1.6) * 260
        M = spr_M(70, 190, wx, wy, 1, -6, 0.52, cam)
        over(dst, warp(im, M))


def draw_plates_bed_night(dst, cam, mid):
    shot = dict(walk=False, dur=1, bg='bedroom')
    draw_plates(dst, 'bedroom', cam, 0, shot, with_char=False, mid_override=mid)


# ------------------------------------------------------------------ frame
CLIP_LEN = {}


def shot_at(t):
    for sh in SHOTS:
        if sh['t0'] <= t < sh['t1']:
            return sh
    return SHOTS[-1]


def render_shot(sh, t, i):
    """returns BGR frame for shot sh at local time t"""
    f = np.zeros((OH, OW, 3), np.uint8)
    kind = sh['kind']
    bg = sh.get('bg', 'bedroom')
    if kind == 'room':
        cam = camera(sh, t)
        cl = {}
        pt = [None]
        def char_fn(d):
            pt[0] = draw_char(d, sh, t, cam)
        draw_plates(f, bg, cam, t, sh, True, char_fn)
        if sh.get('motes'):
            motes(f, t + sh['t0'], bg)
        for a, b in sh.get('speed', []):
            speed_lines(f, t, a, b)
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
    """reveal frame b over a through a growing circle (feathered, cached distance map)"""
    cx, cy = center[0] * S, center[1] * S
    dkey = ('iris_d', center, OW, OH)
    if dkey not in _cache:
        yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
        _cache[dkey] = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    d = _cache[dkey]
    R = k * math.hypot(OW, OH) * 0.95
    m = np.clip((R - d) / (60 * S) + 0.5, 0, 1)
    m_u8 = (m * 255).astype(np.uint8)
    inv_u8 = 255 - m_u8
    m3 = cv2.merge([m_u8, m_u8, m_u8])
    inv3 = cv2.merge([inv_u8, inv_u8, inv_u8])
    return cv2.add(cv2.multiply(a, inv3, scale=1.0 / 255.0), cv2.multiply(b, m3, scale=1.0 / 255.0))


def render_frame(i):
    t = i / FPS
    sh = shot_at(t)
    lt = t - sh['t0']
    f = render_shot(sh, lt, i)
    idx = SHOTS.index(sh)
    # transitions in
    fade = sh.get('fade', 0.4)
    if sh['kind'] == 'lens' and sh.get('iris'):
        fade = 0.7
    if lt < fade and idx > 0:
        prev = SHOTS[idx - 1]
        pf = render_shot(prev, prev['dur'] - 1e-3 + (lt), i)
        k = ease(lt / fade)
        if sh['kind'] == 'lens' and sh.get('iris'):
            f = iris_blend(pf, f, k, sh['iris'])
        else:
            f = cv2.addWeighted(pf, 1 - k, f, k, 0)
    elif lt < sh.get('fade', 0.0) and idx == 0:
        k = ease(lt / sh['fade'])
        f = (f.astype(np.float32) * k).astype(np.uint8)
    # global fade out at the very end
    if t > TOTAL - 0.8:
        f = (f.astype(np.float32) * ease((TOTAL - t) / 0.8)).astype(np.uint8)
    draw_caption(f, t, CLIP_LEN, low=sh['kind'] in ('lens', 'screen'))
    if sh['kind'] == 'room' and bool(sh.get('stamp')):
        pass
    return f


# ------------------------------------------------------------------ main
def ensure_captures():
    os.makedirs(CAPDIR, exist_ok=True)
    mf = os.path.join(FILM, 'captures.json')
    slots = {s: 'captures/%s.png' % s for s in SLOTS}
    if os.path.exists(mf):
        old = json.load(open(mf)).get('slots', {})
        slots = {**slots, **old}
    json.dump({'_note': 'slot -> PNG path (relative to media/film-v3). Replace PNGs with real simulator captures (576x288) and re-render.', 'slots': slots},
              open(mf, 'w'), indent=1)
    for s, rel in slots.items():
        p = rel if os.path.isabs(rel) else os.path.join(FILM, rel)
        if not os.path.exists(p):
            im = Image.new('RGB', (576, 288), (0, 6, 2))
            d = ImageDraw.Draw(im)
            d.rectangle([2, 2, 573, 285], outline=(57, 255, 136), width=2)
            for x in range(0, 576, 48):
                d.line([x, 0, x, 288], fill=(0, 30, 12))
            for y in range(0, 288, 48):
                d.line([0, y, 576, y], fill=(0, 30, 12))
            ft = ImageFont.truetype('C:/Windows/Fonts/consolab.ttf', 40)
            d.text((288, 120), 'PLACEHOLDER', font=ft, fill=(57, 255, 136), anchor='mm')
            d.text((288, 170), s, font=ft, fill=(57, 255, 136), anchor='mm')
            im.save(p)


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
    ff = _resolve_ffmpeg()
    names = {}
    stats = au.mix(ROOT, WORK, TOTAL, SCENES, sfx, clips, ff, out_wav)
    return stats


def _init_worker(clip_len):
    CLIP_LEN.update(clip_len)
    cv2.setNumThreads(1)


def _work(i):
    return render_frame(i).tobytes()


def main():
    t_start = time.time()
    if '--force-layers' in sys.argv or not os.path.exists(os.path.join(LAY, 'manifest.json')):
        args = ['node', os.path.join(ROOT, 'scripts', 'make-film-v3-layers.mjs')] + (['--force'] if '--force-layers' in sys.argv else [])
        subprocess.run(args, cwd=ROOT, check=True)
    ensure_captures()
    out_path = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
    if '--preview' in sys.argv:
        os.makedirs(os.path.join(FILM, 'preview'), exist_ok=True)
        picks = []
        names = ['01_wake', '02_pair', '03_morning', '04_telegram', '05_coding', '06_talk', '07_recap']
        for si, (name, a, b) in enumerate(SCENES):
            rooms = [s for s in SHOTS if s['kind'] == 'room' and a <= s['t0'] < b]
            lens = [s for s in SHOTS if s['kind'] == 'lens' and a <= s['t0'] < b]
            if rooms:
                r = rooms[0]
                picks.append((names[si] + '_char', r['t0'] + min(r['dur'] * 0.55, 2.5)))
            if lens:
                picks.append((names[si] + '_lens', lens[0]['t0'] + 2.0))
        picks.append(('08_title', SHOTS[-1]['t0'] + 3.0))
        for si, sc in enumerate(s for s in SHOTS if s['kind'] == 'screen'):
            picks.append((f'0{si + 2}_screen_{sc["state"]}', sc['t0'] + min(2.8, sc['dur'] * 0.6)))
        picks.append(('01b_nightstand_grip', [s for s in SHOTS if s['kind'] == 'night'][0]['t0'] + 3.5))
        for nm, tt in picks:
            fr = render_frame(int(tt * FPS))
            cv2.imwrite(os.path.join(FILM, 'preview', nm + '.png'), fr)
            print('preview', nm, round(tt, 2))
        print('done in %.1fs' % (time.time() - t_start))
        return
    wav = os.path.join(WORK, 'film_audio.wav')
    stats = build_audio(wav)
    print('audio:', stats, 'total %.1fs, %d frames' % (TOTAL, NFRAMES))
    if out_path is None:
        out_path = os.path.join(WORK, 'onq-film-v3-draft.mp4') if DRAFT else os.path.join(ROOT, 'media', 'out', 'onq-film-v3.mp4')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    ff = _resolve_ffmpeg()
    cmd = [ff, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', '-',
           '-i', wav, '-c:v', 'libx264', '-preset', 'fast' if DRAFT else 'medium', '-crf', '24', '-maxrate', '4000k', '-bufsize', '8000k', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out_path]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    import multiprocessing as mp
    nproc = max(1, min(int(os.environ.get('FILM_PROCS', '6')), (os.cpu_count() or 6) - 1))
    with mp.Pool(nproc, initializer=_init_worker, initargs=(dict(CLIP_LEN),)) as pool:
        for n, b in enumerate(pool.imap(_work, range(NFRAMES), chunksize=8)):
            pr.stdin.write(b)
            if n % 150 == 0:
                print('frame %d/%d  %.0fs' % (n, NFRAMES, time.time() - t_start), flush=True)
    pr.stdin.close()
    pr.wait()
    print('wrote', out_path, 'in %.0fs' % (time.time() - t_start))


if __name__ == '__main__':
    main()

