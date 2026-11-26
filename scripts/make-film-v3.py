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
GREEN = (136, 255, 57)  # BGR of #39ff88

# ------------------------------------------------------------------ timeline
SCENES = [('wake', 0, 24), ('send', 24, 46), ('telegram', 46, 62), ('pair', 62, 88), ('code', 88, 118), ('video', 118, 140), ('recap', 140, 163)]
SLOTS = ['card', 'draft', 'ring', 'done', 'telegram', 'pair', 'coding', 'summary', 'video', 'recap', 'killswitch']
CAPTIONS = [  # (start, text)  five lines in the whole film
    (12.2, 'Your day starts on your glasses.'),
    (35.2, 'You speak. You confirm. You can undo.'),
    (68.6, 'The computer does the work. The glasses just ask.'),
    (124.0, 'Even a video. Just ask.'),
    (154.6, 'You stay in control.'),
]
TITLE = ('OnQ.', 'Your computer, on your glasses.', 'Verified in the Even Hub simulator, not yet on physical glasses.')


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, k):
    return a + (b - a) * k


# shot = (kind, dur, dict). Starts are cumulative.
def _shots():
    R = 'room'
    return [
        (R, 9.0, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-4), cam=((1152, 700, 1.0), (1160, 690, 1.16)), fade=1.4, vignette=0.55,
                      keys=[(0, 'sleep', 0, 0), (6.4, 'neutral', 0, 0), (8.0, 'neutral', 0, -1)], sfx=[(6.2, 'alarm')], motes=True, speed=[(6.5, 6.9)])),
        ('night', 6.0, dict(sfx=[(0.2, 'whoosh')])),
        (R, 3.5, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-4), cam=((1160, 720, 1.25), (1140, 640, 1.7)), fade=0.35,
                      keys=[(0, 'neutral', 0, 0), (0.5, 'neutral', 1, 0), (1.5, 'smile', 1, 0)], flash=0.5, glow=[(1.2, 3.5, 0.9)], motes=True)),
        ('lens', 5.5, dict(slot='card', bg='bedroom', cam=((1500, 520, 1.0), (1500, 520, 1.08)), iris=(1000, 380), sfx=[(0.5, 'chime')])),
        (R, 4.5, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-3), cam=((1150, 690, 1.3), (1150, 690, 1.2)), fade=0.4,
                      keys=[(0, 'focused', 1, 0), (0.1, 'focused', 1, 0)], talk=[(0.8, 3.4)], glow=[(0, 4.5, 0.55)], sfx=[(0.5, 'listen')], speed=[(1.0, 1.35)], wave=(0.8, 3.4))),
        ('lens', 5.0, dict(slot='draft', bg='bedroom', cam=((1500, 520, 1.05), (1500, 520, 1.1)), iris=(1000, 380), sfx=[(0.5, 'chime')])),
        (R, 1.5, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-5), cam=((1150, 690, 1.2), (1150, 690, 1.3)), fade=0.3,
                      keys=[(0, 'smile', 1, 0)], glow=[(0, 1.5, 0.5)], speed=[(0.5, 0.85)], sfx=[(0.5, 'tick')])),
        ('lens', 4.0, dict(slot='ring', bg='bedroom', cam=((1500, 520, 1.1), (1500, 520, 1.12)), iris=(1000, 380),
                           sfx=[(0.5, 'tick'), (1.0, 'tick'), (1.5, 'tick'), (2.0, 'tick')])),
        ('lens', 4.0, dict(slot='done', bg='bedroom', cam=((1500, 520, 1.12), (1500, 520, 1.15)), iris=None, sfx=[(0.3, 'ding')])),
        (R, 3.0, dict(bg='bedroom', char=dict(x=1130, y=800, s=1.12, rot=-3), cam=((1150, 690, 1.35), (1152, 660, 1.0)), fade=0.4,
                      keys=[(0, 'smile', 1, 0)], motes=True, glow=[(0, 1.2, 0.4)])),
        # telegram
        (R, 4.5, dict(bg='street', walk=False, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.0), (1152, 640, 1.08)), fade=0.5, strt=0.55, scroll_v=0,
                      keys=[(0, 'neutral', 1, 0), (1.0, 'surprised', 1, 0), (2.6, 'neutral', 1, -1)], sfx=[(1.0, 'notify')], glow=[(1.0, 4.5, 0.7)])),
        ('lens', 6.0, dict(slot='telegram', bg='street', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.5, 'chime')])),
        (R, 5.5, dict(bg='street', walk=False, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 640, 1.1), (1152, 648, 1.0)), fade=0.4, strt=0.55, scroll_v=0,
                      keys=[(0, 'smile', 1, 0)], sfx=[(0.4, 'ding')], glow=[(0, 1.2, 0.5)], speed=[(0.3, 0.65)])),
        # pair
        (R, 6.0, dict(bg='desk', char=dict(x=900, y=640, s=1.15, rot=-2), cam=((1152, 600, 1.0), (1100, 590, 1.1)), fade=0.5,
                      keys=[(0, 'neutral', 1, 1), (2.2, 'focused', 1, -1)], motes=True)),
        ('screen', 6.0, dict(state='code', sfx=[(0.1, 'whoosh')])),
        ('lens', 6.0, dict(slot='pair', bg='desk', cam=((1300, 560, 1.0), (1300, 560, 1.06)), iris=(1000, 380), sfx=[(0.5, 'chime'), (1.3, 'pair')])),
        ('screen', 4.0, dict(state='paired', sfx=[(0.2, 'pair')])),
        (R, 4.0, dict(bg='desk', char=dict(x=900, y=640, s=1.15, rot=-2), cam=((1100, 590, 1.1), (1152, 620, 1.0)), fade=0.5,
                      keys=[(0, 'smile', 1, 0)], motes=True)),
        # code
        (R, 5.5, dict(bg='street', walk=True, k=0.1, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.0), (1152, 648, 1.06)), fade=0.5,
                      keys=[(0, 'neutral', 1, 0), (1.3, 'focused', 1, 0)], talk=[(1.0, 3.5)], sfx=[(1.0, 'listen')], glow=[(0, 5.5, 0.4)], wave=(1.0, 3.5), speed=[(1.1, 1.45)])),
        ('screen', 5.5, dict(state='term', sfx=[(0.2, 'whoosh')])),
        ('lens', 5.0, dict(slot='coding', bg='desk', cam=((1300, 560, 1.0), (1300, 560, 1.05)), iris=None, sfx=[(0.5, 'chime')])),
        (R, 3.0, dict(bg='street', walk=True, k=0.4, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.06), (1152, 648, 1.0)), fade=0.4,
                      keys=[(0, 'neutral', 1, 0), (0.8, 'smile', 1, 0)], glow=[(0, 1.0, 0.5)])),
        ('lens', 6.0, dict(slot='summary', bg='street', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.5, 'chime')])),
        (R, 5.0, dict(bg='street', walk=True, k=0.7, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.0), (1152, 648, 1.12)), fade=0.5,
                      keys=[(0, 'smile', 1, 0)], motes=False)),
        # video
        (R, 5.5, dict(bg='street', walk=True, k=0.9, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.05), (1152, 648, 1.0)), fade=0.5,
                      keys=[(0, 'neutral', 1, 0), (1.0, 'focused', 1, 0)], talk=[(1.0, 4.2)], sfx=[(1.0, 'listen')], glow=[(0, 5.5, 0.4)], wave=(1.0, 4.2), speed=[(1.1, 1.45)])),
        ('screen', 6.0, dict(state='render', sfx=[(0.2, 'whoosh'), (1.0, 'render'), (3.4, 'render')])),
        ('lens', 6.0, dict(slot='video', bg='street', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=None, sfx=[(0.5, 'chime')])),
        (R, 4.5, dict(bg='street', walk=True, k=0.55, char=dict(x=1152, y=745, s=1.15, rot=0), cam=((1152, 648, 1.0), (1152, 648, 1.1)), fade=0.5,
                      keys=[(0, 'surprised', 1, 0), (1.0, 'smile', 1, 0)], speed=[(0.1, 0.5)], sfx=[(0.2, 'ding')])),
        # recap
        (R, 5.5, dict(bg='balcony', char=dict(x=1060, y=700, s=1.15, rot=0), cam=((1152, 670, 1.0), (1120, 650, 1.1)), fade=0.7,
                      keys=[(0, 'neutral', 1, 0), (3.0, 'smile', 1, 0)], motes=True)),
        ('lens', 6.0, dict(slot='recap', bg='balcony', cam=((1500, 520, 1.0), (1500, 520, 1.06)), iris=(1000, 380), sfx=[(0.5, 'chime')])),
        (R, 2.5, dict(bg='balcony', char=dict(x=1060, y=700, s=1.15, rot=1), cam=((1120, 650, 1.1), (1100, 640, 1.2)), fade=0.4,
                      keys=[(0, 'focused', 1, 0), (1.0, 'neutral', 1, 0)], motes=True, glow=[(0, 2.5, 0.5)])),
        ('lens', 4.0, dict(slot='killswitch', bg='balcony', cam=((1500, 520, 1.0), (1500, 520, 1.05)), iris=(1000, 380), sfx=[(0.4, 'kill')])),
        ('title', 5.0, dict(bg='balcony')),
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
BGR_TINT = {  # BGR multipliers per scene (grade)
    'bedroom': (0.96, 0.97, 1.03), 'street': (1.0, 1.0, 1.0), 'desk': (0.88, 0.95, 1.06), 'balcony': (1.02, 0.95, 0.96),
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
    a = src[..., 3:4].astype(np.uint16)
    s = src[..., :3]
    if opacity < 1.0:
        a = (a * opacity).astype(np.uint16)
        s = (s.astype(np.float32) * opacity).astype(np.uint8)
    out = (dst.astype(np.uint16) * (255 - a) + 127) // 255 + s
    np.minimum(out, 255, out=out)
    dst[:] = out.astype(np.uint8)


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
        _post['noise'] = [rng.normal(0, 5.5, (OH, OW)).astype(np.float32) for _ in range(6)]
    return _post['noise']


def post(dst, i, bg='bedroom', bloom=0.35, grain=1.0, vignette=True):
    small = cv2.resize(dst, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA)
    hi = cv2.subtract(small, np.full_like(small, 200))
    hi = cv2.GaussianBlur(hi, (0, 0), 9)
    up = cv2.resize(hi, (OW, OH), interpolation=cv2.INTER_LINEAR)
    cv2.addWeighted(dst, 1.0, up, bloom * 1.7, 0, dst=dst)
    if vignette:
        dst[:] = cv2.multiply(dst, post_masks(bg), scale=1 / 128.0)
    if grain:
        nb = noise_bank()[i % 6]
        dx, dy = (i * 37) % OW, (i * 91) % OH
        n = np.roll(nb, (dy, dx), (0, 1)) * grain
        t = dst.astype(np.float32) + n[..., None]
        dst[:] = np.clip(t, 0, 255).astype(np.uint8)


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
        _capcache[i] = pil_to_pm(text_rgba(CAPTIONS[i][1], font('ui', 50)))
    return _capcache[i]


def draw_caption(dst, t, clip_len, low=False):
    for i, (t0, _) in enumerate(CAPTIONS):
        d = clip_len.get(i, 2.5)
        t1 = t0 + d + 0.9
        if t0 - 0.2 <= t <= t1 + 0.4:
            a = min(ease((t - (t0 - 0.2)) / 0.5), ease((t1 + 0.4 - t) / 0.5))
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
        im = cv2.imread(p, cv2.IMREAD_COLOR)
        if im is None:
            im = np.zeros((288, 576, 3), np.uint8)
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
    sm = cv2.GaussianBlur(sm, (0, 0), 4.2)
    bgb = cv2.resize(sm, (OW, OH), interpolation=cv2.INTER_CUBIC)
    bgb = (bgb.astype(np.float32) * 0.62).astype(np.uint8)
    # HUD
    hud = hud_layer(shot['slot'])
    hh, ww = hud.shape[:2]
    k = ease(t / 0.45)
    flick = 1.0 if t > 0.5 else (0.75 + 0.25 * math.sin(t * 90)) * k
    off = 8 * S * math.sin(t * 0.8)
    x = int(OW / 2 - ww / 2 + 6 * S * math.sin(t * 0.5))
    y = int(OH * 0.5 - hh / 2 + off)
    scale = 0.96 + 0.04 * k
    hudz = cv2.resize(hud, (int(ww * scale), int(hh * scale)), interpolation=cv2.INTER_LINEAR) if scale != 1 else hud
    h2, w2 = hudz.shape[:2]
    x, y = int(OW / 2 - w2 / 2), int(OH * 0.5 - h2 / 2 + off)
    layer = np.zeros((OH, OW, 3), np.uint8)
    layer[y:y + h2, x:x + w2] = (hudz.astype(np.float32) * flick).astype(np.uint8)
    # scan sweep
    if t < 0.9:
        sy = int(y + (h2) * (t / 0.9))
        cv2.rectangle(layer, (x, max(0, sy - int(3 * S))), (x + w2, sy + int(3 * S)), tuple(int(c * 0.9) for c in GREEN), -1)
    g1 = cv2.GaussianBlur(layer, (0, 0), 9 * S)
    g2 = cv2.GaussianBlur(layer, (0, 0), 34 * S)
    # dark glass pane behind the HUD so it reads
    pane = np.zeros((OH, OW), np.float32)
    cv2.rectangle(pane, (x - int(26 * S), y - int(26 * S)), (x + w2 + int(26 * S), y + h2 + int(26 * S)), 1.0, -1)
    pane = cv2.GaussianBlur(pane, (0, 0), 22 * S) * 0.45 * k
    bgb = (bgb.astype(np.float32) * (1 - pane[..., None])).astype(np.uint8)
    cv2.addWeighted(bgb, 1.0, layer, 1.0, 0, dst=bgb)
    cv2.addWeighted(bgb, 1.0, g1, 0.9, 0, dst=bgb)
    cv2.addWeighted(bgb, 1.0, g2, 0.8, 0, dst=bgb)
    ov, glare = lens_overlay()
    over(bgb, ov)
    add(bgb, cv2.merge([glare] * 3), 1.0)
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
        d.text((px(140), px(120)), 'Pair your glasses' if st == 'code' else 'Glasses connected', font=font('uib', 54 * z), fill=(232, 240, 236))
        d.text((px(140), px(200)), 'Open OnQ on the glasses and type this code.' if st == 'code' else 'Paired with this computer.', font=font('light', 34 * z), fill=(140, 160, 160))
        shown = int(min(1, max(0, (t - 0.7) / 2.0)) * 6) if st == 'code' else 6
        x = 140
        digits = [c for c in code if c != ' ']
        fnt = font('monob', 170 * z)
        for n, c in enumerate(digits):
            if n == 3:
                x += 70
            a = n < shown or st == 'paired'
            col = (57, 255, 136) if a else (36, 52, 48)
            d.text((px(x), px(300)), c if a else '-', font=fnt, fill=col)
            x += 150
        if st == 'code':
            dots = '.' * (1 + int(t * 2) % 3)
            d.text((px(140), px(600)), 'Waiting for glasses' + dots, font=font('mono', 32 * z), fill=(120, 140, 150))
        else:
            k = ease((t - 0.2) / 0.5)
            cx_, cy_, r = px(300), px(660), int(px(52) * k)
            d.ellipse([cx_ - r, cy_ - r, cx_ + r, cy_ + r], outline=(57, 255, 136), width=max(2, px(6)))
            if k > 0.6:
                d.line([cx_ - px(24), cy_, cx_ - px(6), cy_ + px(20), cx_ + px(28), cy_ - px(20)], fill=(57, 255, 136), width=max(2, px(8)))
            d.text((px(390), px(630)), 'Ready for voice commands', font=font('light', 36 * z), fill=(160, 190, 180))
    elif st == 'term':
        lines = [
            ('$ onq run "fix the failing test"', (200, 215, 220)),
            ('harness  coding agent attached', (120, 150, 160)),
            ('tests    FAIL  auth.test.ts  1 failing', (255, 110, 110)),
            ('edit     src/auth.ts  +4 -2', (200, 215, 220)),
            ('tests    PASS  24 passed', (57, 255, 136)),
            ('summary  sent to glasses', (120, 255, 190)),
        ]
        fnt = font('mono', 38 * z)
        y = 90
        nch = int(t * 34)
        for txt, col in lines:
            if nch <= 0:
                break
            d.text((px(70), px(y)), txt[:nch], font=fnt, fill=col)
            nch -= len(txt) + 6
            y += 82
        if int(t * 2) % 2 == 0:
            d.rectangle([px(70), px(y + 4), px(96), px(y + 44)], fill=(57, 255, 136))
    elif st == 'render':
        d.text((px(70), px(80)), "Standup  today", font=font('uib', 46 * z), fill=(232, 240, 236))
        prog = min(1.0, max(0, (t - 0.8) / 3.6))
        d.rounded_rectangle([px(70), px(190), px(1430), px(240)], radius=px(25), fill=(30, 40, 46))
        if prog > 0:
            d.rounded_rectangle([px(70), px(190), px(70 + 1360 * prog), px(240)], radius=px(25), fill=(57, 255, 136))
        txt = 'Rendering %d%%' % int(prog * 100) if prog < 1 else 'Video ready  0:20'
        d.text((px(70), px(262)), txt, font=font('mono', 36 * z), fill=(180, 200, 195))
        cols = [(70, 110, 160), (180, 100, 120), (90, 160, 140), (200, 160, 90), (120, 100, 180)]
        for n in range(5):
            x0 = 70 + n * 270
            d.rounded_rectangle([px(x0), px(360), px(x0 + 250), px(560)], radius=px(14), fill=cols[n])
            d.rectangle([px(x0), px(540), px(x0 + 250 * min(1, max(0, prog * 5 - n))), px(560)], fill=(57, 255, 136))
        d.rectangle([px(70), px(640), px(1430), px(700)], fill=(24, 30, 38))
        d.rectangle([px(70 + 1360 * prog - 3), px(620), px(70 + 1360 * prog + 3), px(720)], fill=(255, 255, 255))
    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    # bezel + soft glow, centred
    x0, y0 = (OW - sw) // 2, int(OH * 0.5 - sh / 2)
    bez = int(26 * S)
    cv2.rectangle(frame, (x0 - bez, y0 - bez), (x0 + sw + bez, y0 + sh + bez), (46, 40, 52), -1)
    glow = np.zeros_like(frame)
    cv2.rectangle(glow, (x0, y0), (x0 + sw, y0 + sh), (200, 180, 120) if st != 'term' else (120, 160, 90), -1)
    glow = cv2.GaussianBlur(glow, (0, 0), 50 * S)
    cv2.addWeighted(frame, 1, glow, 0.22, 0, dst=frame)
    frame[y0:y0 + sh, x0:x0 + sw] = arr
    # glass reflection streak
    ov = np.zeros((OH, OW), np.float32)
    cv2.line(ov, (x0 + int(sw * 0.1), y0 + sh), (x0 + int(sw * 0.45), y0), 1.0, int(120 * S))
    ov = cv2.GaussianBlur(ov, (0, 0), 30 * S) * 14
    frame = np.clip(frame.astype(np.float32) + ov[..., None], 0, 255).astype(np.uint8)
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
    """reveal frame b over a through a growing circle (feathered)"""
    cx, cy = center[0] * S, center[1] * S
    R = k * math.hypot(OW, OH) * 0.95
    yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    m = np.clip((R - d) / (60 * S) + 0.5, 0, 1)[..., None]
    return (a.astype(np.float32) * (1 - m) + b.astype(np.float32) * m).astype(np.uint8)


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
    for n, (t0, txt) in enumerate(CAPTIONS):
        p = au.tts(ROOT, WORK, txt)
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
    if '--force-layers' in sys.argv or not os.path.exists(os.path.join(LAY, 'manifest.json')) or True:
        args = ['node', os.path.join(ROOT, 'scripts', 'make-film-v3-layers.mjs')] + (['--force'] if '--force-layers' in sys.argv else [])
        subprocess.run(args, cwd=ROOT, check=True)
    ensure_captures()
    out_path = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
    if '--preview' in sys.argv:
        os.makedirs(os.path.join(FILM, 'preview'), exist_ok=True)
        # caption lengths are only needed for timing; use defaults for stills
        picks = []
        names = ['01_wake', '02_send', '03_telegram', '04_pair', '05_code', '06_video', '07_recap']
        for si, (name, a, b) in enumerate(SCENES):
            rooms = [s for s in SHOTS if s['kind'] == 'room' and a <= s['t0'] < b]
            lens = [s for s in SHOTS if s['kind'] == 'lens' and a <= s['t0'] < b]
            shots = [(rooms[0], 0.5), (lens[0], 2.2)] if rooms and lens else []
            if rooms:
                r = rooms[len(rooms) // 2 if name == 'send' else 0]
                picks.append((names[si] + '_char', r['t0'] + min(r['dur'] * 0.55, 3.0)))
            if lens:
                picks.append((names[si] + '_lens', lens[0]['t0'] + 2.2))
        if True:
            picks.append(('08_title', SHOTS[-1]['t0'] + 3.0))
            sc = [s for s in SHOTS if s['kind'] == 'screen'][0]
            picks.append(('04_screen', sc['t0'] + 3.0))
            picks.append(('01b_nightstand', [s for s in SHOTS if s['kind'] == 'night'][0]['t0'] + 3.6))
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
    nproc = max(1, min(int(os.environ.get('FILM_PROCS', '3')), (os.cpu_count() or 4) - 1))
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

