"""
OnQ pixel-anime film: "A Day With OnQ".
Pixel scenes are drawn procedurally. Every glasses HUD and the screen recording are REAL captures
(EvenHub Simulator 0.9.5 PNGs from docs/screenshots + media/raw/sim, and the recorded web app).
Narration is AssemblyAI TTS-1 via scripts/tts-vo-helper.mjs.

Usage:
  python scripts/make-anime-film.py --preview    # one still per scene into media/raw/anime/
  python scripts/make-anime-film.py              # full render -> media/out/onq-anime-film.mp4
"""
import json
import math
import os
import subprocess
import sys
import textwrap
import wave

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.getcwd()
FF = imageio_ffmpeg.get_ffmpeg_exe()
WORK = os.path.join(ROOT, "media", "raw", "anime")
OUT = os.path.join(ROOT, "media", "out", "onq-anime-film.mp4")
os.makedirs(WORK, exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)

W, H, S = 1920, 1080, 4  # output size, pixel scale
GW, GH = W // S, H // S  # 480 x 270 pixel grid
FPS = 30
SR = 48000
GREEN = (52, 245, 126)
INK = (8, 12, 10)

SHOTS = os.path.join(ROOT, "docs", "screenshots")
SIM = os.path.join(ROOT, "media", "raw", "sim")

# ---------------------------------------------------------------- scenes
# hud: list of (png path, from_fraction, to_fraction). ring frames cycle for the undo ring beat.
SCENES = [
    dict(id="title", clock=None, title="", min_s=4.5, vo=None, hud=[]),
    dict(
        id="morning", clock="07:30", title="MORNING  /  CORRIDOR BRIEF", min_s=17,
        vo="Seven thirty. Mika puts on her glasses. One glance shows who she meets, what they asked in Gmail, "
           "and the doc that goes with it. All on a seven line lens.",
        hud=[(f"{SHOTS}/sim-01-dossier.png", 0.0, 1.0)],
    ),
    dict(
        id="hallway", clock="08:45", title="HALLWAY  /  RUNNING LATE", min_s=24,
        vo="Running late? She just says it. OnQ stages the change and defaults to no. A two second ring counts down. "
           "Tap to cancel, or let it finish, and Calendar and Gmail update with a receipt.",
        hud=[(f"{SHOTS}/sim-04-preview-no.png", 0.0, 0.36),
             ("RING", 0.36, 0.7),
             (f"{SHOTS}/sim-06-receipt-done.png", 0.7, 1.0)],
    ),
    dict(
        id="meeting", clock="10:30", title="MEETING  /  PRIVATE SCRIBE", min_s=21,
        vo="In the meeting, OnQ keeps notes in memory only. Say OnQ and it answers on the lens. "
           "Say wrap up, and Notion tasks, a calendar hold and an email draft wait for approval.",
        hud=[(f"{SHOTS}/sim-08-pixel-avatar.png", 0.0, 1.0)],
    ),
    dict(
        id="cafe", clock="13:00", title="LUNCH  /  DOUBLE-BOOKING LOCK", min_s=17,
        vo="Someone asks for a slot that is already taken. OnQ blocks the double booking and offers the next free time. "
           "Nothing is written.",
        hud=[(f"{SHOTS}/sim-07-conflict-409.png", 0.0, 1.0)],
    ),
    dict(
        id="dusk", clock="16:00", title="AFTERNOON  /  TELEGRAM + APPROVALS", min_s=20,
        vo="Telegram pings land on the lens. Anything that sends becomes an approval, and the same approval shows up "
           "in Telegram and the web app.",
        hud=[(f"{SHOTS}/sim-10-telegram.png", 0.0, 0.5), (f"{SHOTS}/sim-12-unified-os.png", 0.5, 1.0)],
    ),
    dict(
        id="crew", clock="18:30", title="EVENING  /  SPECIALIST CREW", min_s=17,
        vo="A crew of specialist agents checks Calendar, mail and the repo, and an auditor signs off. "
           "A global kill switch stops all of it.",
        hud=[(f"{SHOTS}/sim-13-os-pipeline-live.png", 0.0, 1.0)],
    ),
    dict(
        id="recording", clock=None, title="THE REAL APP  /  SCREEN RECORDING", min_s=15,
        vo="This is the real app, recorded. Same confirm step, same ring, same receipt.",
        hud=[],
    ),
    dict(
        id="night", clock="22:00", title="NIGHT  /  VERIFIED, NOT CLAIMED", min_s=21,
        vo="Verified in the simulator: two hundred fifty-one tests, thirty-two of thirty-two eval intents, eleven display "
           "gates and a ten domain security audit. Physical glasses are the next test.",
        hud=[],
    ),
]


# ---------------------------------------------------------------- fonts / text
def font(size, bold=True, mono=True):
    names = (["consolab.ttf", "consola.ttf"] if mono else ["segoeuib.ttf", "segoeui.ttf"]) if bold else ["consola.ttf"]
    for n in names:
        p = os.path.join(r"C:\Windows\Fonts", n)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


F_CAP = font(34)
F_TITLE = font(26)
F_BUBBLE = font(36)
F_BIG = font(86)
F_MID = font(44)
F_SM = font(24)

DIGITS = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "001", "001", "001"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
    ":": ["0", "1", "0", "1", "0"],
}


def R(d, x, y, w, h, c):
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)


def pixel_text(d, x, y, s, scale, color):
    cx = x
    for ch in s:
        g = DIGITS.get(ch)
        if not g:
            cx += 2 * scale
            continue
        for ry, row in enumerate(g):
            for rx, bit in enumerate(row):
                if bit == "1":
                    R(d, cx + rx * scale, y + ry * scale, scale, scale, color)
        cx += (len(g[0]) + 1) * scale


# ---------------------------------------------------------------- people
SKIN, SHADE = (247, 208, 176), (230, 184, 148)
PAL = {
    "mika": dict(hair=(29, 42, 85), hl=(86, 112, 200), eye=(47, 214, 160), top=(34, 43, 58), pants=(47, 54, 70), long=False),
    "priya": dict(hair=(74, 42, 34), hl=(130, 80, 64), eye=(122, 74, 42), top=(194, 69, 122), pants=(47, 54, 70), long=True),
    "alex": dict(hair=(224, 116, 44), hl=(255, 177, 92), eye=(47, 111, 214), top=(59, 106, 74), pants=(47, 54, 70), long=False),
    "dana": dict(hair=(42, 42, 52), hl=(110, 110, 130), eye=(30, 30, 30), top=(122, 92, 194), pants=(47, 54, 70), long=True),
}


def person(d, cx, fy, who, t, *, talk=False, walk=False, glasses=False, glow=0.0, seated_at=None, look=0, arms_up=False, k=2):
    p = PAL[who]
    oy = fy if seated_at is None else seated_at

    def R(d_, x, y, w, h, c):  # draw in character space, scaled by k around the feet (or seat line)
        X = cx + (x - cx) * k
        Y = oy + (y - oy) * k
        d_.rectangle([round(X), round(Y), round(X + w * k) - 1, round(Y + h * k) - 1], fill=c)

    bob = int(round(math.sin(t * (9 if walk else 2.2)) * (1.6 if walk else 0.8)))
    blink = (int(t * 30) % 96) in (0, 1, 2, 3)
    phase = int(t * 6) % 2 if walk else 0
    leg_h, body_h = 8, 12
    legs_top = fy - leg_h
    body_top = (legs_top - body_h + bob) if seated_at is None else seated_at - body_h
    head_top = body_top - 17
    x0 = cx - 11
    if p["long"]:
        R(d, x0 - 2, head_top - 1, 26, 34, p["hair"])
    else:
        R(d, x0 - 2, head_top - 1, 26, 22, p["hair"])
    if seated_at is None:
        lift = [2, 0] if phase == 0 else [0, 2]
        for i, lx in enumerate((cx - 6, cx + 1)):
            R(d, lx, legs_top - lift[i], 5, leg_h, p["pants"])
            R(d, lx - 1, fy - 2 - lift[i], 7, 2, (20, 24, 30))
    R(d, cx - 8, body_top, 16, body_h, p["top"])
    R(d, cx - 8, body_top + 7, 16, 1, GREEN)
    R(d, cx - 3, body_top, 6, 2, SHADE)
    sw = 2 if walk and phase == 0 else (-2 if walk else 0)
    ay = -5 if arms_up else 0
    R(d, cx - 11, body_top + 1 + sw + ay, 3, 9 if not arms_up else 6, p["top"])
    R(d, cx + 8, body_top + 1 - sw + ay, 3, 9 if not arms_up else 6, p["top"])
    R(d, cx - 11, body_top + 9 + sw + ay, 3, 2, SKIN)
    R(d, cx + 8, body_top + 9 - sw + ay, 3, 2, SKIN)
    # head
    R(d, x0, head_top + 3, 22, 14, SKIN)
    R(d, x0 + 1, head_top + 17, 20, 1, SKIN)
    R(d, x0 + 3, head_top + 18, 16, 1, SKIN)
    R(d, x0 + 6, head_top + 19, 10, 1, SHADE)
    ey = head_top + 9
    for ex in (cx - 8, cx + 3):
        if blink:
            R(d, ex, ey + 3, 5, 1, (40, 30, 40))
        else:
            R(d, ex, ey, 5, 6, (255, 255, 255))
            ix = ex + 1 + look
            R(d, ix, ey + 1, 3, 5, p["eye"])
            R(d, ix + 1, ey + 2, 1, 2, (20, 24, 40))
            R(d, ix, ey + 1, 1, 1, (255, 255, 255))
    R(d, cx - 9, head_top + 14, 2, 1, (255, 150, 160))
    R(d, cx + 7, head_top + 14, 2, 1, (255, 150, 160))
    if talk and int(t * 9) % 2 == 0:
        R(d, cx - 1, head_top + 16, 3, 2, (150, 50, 70))
    else:
        R(d, cx - 1, head_top + 16, 3, 1, (170, 70, 90))
    if glasses:
        fc = (10, 15, 12)
        for gx in (cx - 10, cx + 1):
            R(d, gx, head_top + 7, 9, 1, fc)
            R(d, gx, head_top + 15, 9, 1, fc)
            R(d, gx, head_top + 7, 1, 9, fc)
            R(d, gx + 8, head_top + 7, 1, 9, fc)
            R(d, gx + 2, head_top + 8, 2, 1, (120, 255, 170))
        R(d, cx - 1, head_top + 10, 2, 1, fc)
        R(d, x0 - 1, head_top + 9, 2, 1, fc)
        R(d, x0 + 21, head_top + 9, 2, 1, fc)
    # hair front
    R(d, x0 - 1, head_top, 24, 5, p["hair"])
    R(d, x0 + 2, head_top + 5, 4, 2, p["hair"])
    R(d, x0 + 9, head_top + 5, 3, 3, p["hair"])
    R(d, x0 + 15, head_top + 5, 5, 2, p["hair"])
    R(d, x0 - 1, head_top + 5, 3, 9, p["hair"])
    R(d, x0 + 20, head_top + 5, 3, 9, p["hair"])
    R(d, x0 + 4, head_top + 1, 6, 1, p["hl"])
    R(d, cx, head_top - 4, 1, 3, p["hair"])
    if who == "mika":
        R(d, x0 + 17, head_top + 1, 3, 2, GREEN)
    if glasses and glow > 0:
        ov = Image.new("RGBA", (GW, GH), (0, 0, 0, 0))
        od = ImageDraw.Draw(ov)
        a = int(34 * glow)
        gx0, gy0 = cx + (-14) * k, oy + (head_top + 4 - oy) * k
        gx1, gy1 = cx + 14 * k, oy + (head_top + 19 - oy) * k
        od.rectangle([gx0, gy0, gx1, gy1], fill=(52, 245, 126, a))
        d._image.paste(Image.alpha_composite(d._image.convert("RGBA"), ov).convert("RGB"))
    return (cx, oy + (head_top + 11 - oy) * k)  # glasses anchor (grid coords)


# ---------------------------------------------------------------- backgrounds
def grad(img, top, bot, y0=0, y1=None):
    y1 = GH if y1 is None else y1
    d = ImageDraw.Draw(img)
    for y in range(y0, y1):
        k = (y - y0) / max(1, y1 - y0 - 1)
        d.line([0, y, GW, y], fill=tuple(int(top[i] + (bot[i] - top[i]) * k) for i in range(3)))


def stars(d, seed, n, a=1.0):
    rng = np.random.default_rng(seed)
    for _ in range(n):
        x, y = int(rng.integers(0, GW)), int(rng.integers(0, 120))
        R(d, x, y, 1, 1, (int(220 * a), int(230 * a), int(255 * a)))


def building_row(d, seed, base_y, color, lit, t=0.0, minh=40, maxh=110):
    rng = np.random.default_rng(seed)
    x = -10
    while x < GW:
        w = int(rng.integers(26, 50))
        h = int(rng.integers(minh, maxh))
        R(d, x, base_y - h, w, h, color)
        for wy in range(base_y - h + 6, base_y - 6, 9):
            for wx in range(x + 4, x + w - 5, 8):
                if rng.random() < 0.45:
                    on = (math.sin(t * 0.8 + wx * 0.7 + wy) > -0.6)
                    R(d, wx, wy, 3, 4, lit if on else (color[0] + 10, color[1] + 10, color[2] + 14))
        x += w + int(rng.integers(0, 6))


def bg_static(sc):
    img = Image.new("RGB", (GW, GH), (0, 0, 0))
    d = ImageDraw.Draw(img)
    if sc == "morning":
        grad(img, (255, 190, 150), (255, 226, 200), 0, 170)
        R(d, 0, 170, GW, 100, (126, 90, 74))
        for y in range(172, GH, 12):
            R(d, 0, y, GW, 1, (108, 76, 62))
        R(d, 300, 40, 150, 100, (60, 40, 70))
        R(d, 304, 44, 142, 92, (255, 205, 160))
        R(d, 372, 44, 2, 92, (60, 40, 70))
        R(d, 304, 88, 142, 2, (60, 40, 70))
        R(d, 80, 150, 190, 8, (96, 68, 52))
        R(d, 86, 158, 6, 60, (80, 56, 44))
        R(d, 258, 158, 6, 60, (80, 56, 44))
        R(d, 130, 112, 70, 38, (30, 34, 44))
        R(d, 134, 116, 62, 30, (20, 70, 44))
        R(d, 150, 150, 30, 4, (50, 54, 66))
        R(d, 236, 136, 12, 14, (240, 240, 240))
        R(d, 20, 130, 30, 88, (90, 64, 50))
        R(d, 24, 110, 22, 22, (70, 160, 90))
        R(d, 30, 100, 10, 14, (90, 190, 110))
    elif sc == "hallway":
        grad(img, (46, 56, 84), (70, 82, 112), 0, 150)
        R(d, 0, 150, GW, 120, (92, 98, 120))
        for x in range(0, GW, 60):
            R(d, x, 150, 2, 120, (80, 86, 108))
        for i in range(8):
            R(d, 20 + i * 60, 18, 28, 4, (255, 245, 200))
        for x in (40, 200, 360):
            R(d, x, 60, 56, 90, (58, 44, 52))
            R(d, x + 4, 64, 48, 82, (118, 84, 70))
            R(d, x + 40, 104, 4, 4, (240, 220, 120))
        R(d, 140, 30, 24, 24, (240, 240, 240))
        R(d, 150, 36, 2, 10, (20, 20, 30))
        R(d, 150, 44, 8, 2, (20, 20, 30))
    elif sc == "meeting":
        grad(img, (60, 74, 110), (90, 104, 140), 0, 150)
        R(d, 0, 150, GW, 120, (74, 62, 56))
        R(d, 40, 30, 160, 90, (235, 238, 240))
        R(d, 44, 34, 152, 82, (248, 250, 250))
        for i, ww in enumerate((90, 60, 110, 70)):
            R(d, 56, 46 + i * 16, ww, 3, (120, 130, 150))
        R(d, 330, 36, 120, 80, (50, 50, 70))
        R(d, 334, 40, 112, 72, (120, 170, 230))
        R(d, 334, 82, 112, 30, (40, 60, 90))
        R(d, 60, 186, 360, 14, (120, 82, 62))
        R(d, 70, 200, 8, 50, (92, 62, 48))
        R(d, 402, 200, 8, 50, (92, 62, 48))
    elif sc == "cafe":
        grad(img, (255, 214, 170), (255, 236, 205), 0, 150)
        R(d, 0, 150, GW, 120, (150, 108, 84))
        R(d, 0, 110, GW, 8, (110, 76, 58))
        R(d, 0, 118, 190, 52, (140, 98, 74))
        for x in (60, 190, 330, 440):
            R(d, x, 0, 1, 40, (50, 40, 40))
            R(d, x - 8, 40, 17, 6, (255, 200, 90))
        R(d, 340, 130, 100, 6, (86, 60, 46))
        R(d, 380, 136, 6, 50, (70, 48, 38))
        R(d, 20, 40, 130, 56, (60, 44, 40))
        R(d, 26, 46, 118, 44, (250, 232, 200))
    elif sc == "dusk":
        grad(img, (255, 140, 120), (130, 90, 170), 0, 190)
        R(d, 0, 190, GW, 80, (50, 44, 70))
        R(d, 0, 218, GW, 4, (255, 210, 120))
        for x in range(0, GW, 40):
            R(d, x, 240, 22, 3, (255, 210, 120))
    elif sc == "crew":
        grad(img, (20, 26, 40), (34, 44, 64), 0, 160)
        R(d, 0, 160, GW, 110, (44, 40, 56))
        R(d, 30, 70, 170, 70, (14, 20, 22))
        R(d, 34, 74, 162, 62, (8, 36, 22))
        for i in range(5):
            R(d, 42, 82 + i * 11, 40 + (i * 23) % 70, 3, GREEN)
        R(d, 300, 60, 140, 80, (14, 20, 22))
        R(d, 304, 64, 132, 72, (8, 36, 22))
        R(d, 60, 200, 360, 12, (88, 70, 90))
        R(d, 80, 212, 8, 40, (70, 54, 74))
        R(d, 390, 212, 8, 40, (70, 54, 74))
    elif sc == "night":
        grad(img, (8, 10, 26), (28, 26, 60), 0, 200)
        R(d, 0, 200, GW, 70, (20, 22, 36))
    return img


def bg_frame(sc, t, base):
    img = base.copy()
    d = ImageDraw.Draw(img)
    if sc == "morning":
        sy = 118 - min(20, t * 1.6)
        R(d, 330, int(sy), 16, 16, (255, 250, 200))
        R(d, 326, int(sy) + 4, 24, 8, (255, 236, 170))
        for i, cx in enumerate((310, 380, 420)):
            x = int((cx + t * 4 + i * 20) % 150) + 300
            R(d, x, 60 + i * 9, 20, 5, (255, 255, 255))
        for k in range(3):
            R(d, 238 + k * 3, 128 - int((t * 8 + k * 5) % 14), 1, 4, (255, 255, 255))
    elif sc == "hallway":
        for k in range(6):
            x = int((t * 140 + k * 90) % (GW + 60)) - 30
            R(d, GW - x, 200 + (k % 3) * 18, 26, 1, (140, 150, 190))
    elif sc == "meeting":
        pass
    elif sc == "night":
        stars(d, 7, 90, 0.5 + 0.5 * math.sin(t * 2.0) ** 2)
        d.ellipse([376, 30, 404, 58], fill=(250, 246, 220))   # moon
        d.ellipse([385, 26, 412, 53], fill=(12, 13, 33))      # crescent bite (matches sky at that height)
        building_row(d, 3, 200, (18, 20, 40), (255, 214, 120), t)
        R(d, 0, 200, GW, 70, (20, 22, 36))
    elif sc == "dusk":
        building_row(d, 11, 190, (44, 34, 66), (255, 214, 140), t, 50, 130)
        R(d, 0, 190, GW, 80, (50, 44, 70))
        R(d, 0, 218, GW, 4, (255, 210, 120))
        for x in range(0, GW, 40):
            R(d, x, 240, 22, 3, (255, 210, 120))
    return img


# ---------------------------------------------------------------- scene drawing
def draw_scene(sc, t, dur):
    """Return (grid image RGB, glasses anchor or None, caption overlay data)."""
    base = STATIC.get(sc)
    img = bg_frame(sc, t, base) if base is not None else Image.new("RGB", (GW, GH), (6, 8, 7))
    d = ImageDraw.Draw(img)
    anchor = None
    glow = 0.5 + 0.5 * math.sin(t * 3)
    if sc == "title":
        img = Image.new("RGB", (GW, GH), (6, 10, 8))
        d = ImageDraw.Draw(img)
        stars(d, 5, 140, 0.6)
        k = min(1.0, t / 1.4)
        person(d, 240, int(236 + (1 - k) * 40), "mika", t, glasses=True, glow=glow)
        for i in range(10):
            a = t * 1.5 + i
            R(d, int(240 + math.cos(a) * 50), int(150 + math.sin(a * 1.3) * 30), 2, 2, GREEN)
    elif sc == "morning":
        anchor = person(d, 190, 218, "mika", t, glasses=t > 3.0, glow=glow, talk=2 < t < 6, look=1 if t > 8 else 0)
    elif sc == "hallway":
        x = int(60 + (t / dur) * 280)
        walk = t < dur * 0.55
        anchor = person(d, x if walk else int(60 + 0.55 * 280), 228, "mika", t, glasses=True, glow=glow, walk=walk,
                        talk=dur * 0.12 < t < dur * 0.3)
    elif sc == "meeting":
        person(d, 150, 0, "priya", t, seated_at=205, talk=int(t / 3) % 3 == 1)
        person(d, 330, 0, "alex", t, seated_at=205, talk=int(t / 3) % 3 == 2)
        R(d, 60, 186, 360, 14, (120, 82, 62))
        anchor = person(d, 240, 0, "mika", t, glasses=True, glow=glow, seated_at=205, talk=int(t / 3) % 3 == 0)
        R(d, 60, 196, 360, 6, (120, 82, 62))
    elif sc == "cafe":
        person(d, 120, 228, "dana", t, talk=t < dur * 0.4)
        anchor = person(d, 330, 228, "mika", t, glasses=True, glow=glow, talk=t > dur * 0.45)
        R(d, 200, 214, 60, 5, (86, 60, 46))
        R(d, 226, 219, 5, 24, (70, 48, 38))
        R(d, 210, 204, 10, 10, (250, 250, 250))
    elif sc == "dusk":
        x = int(40 + (t / dur) * 360)
        anchor = person(d, x, 228, "mika", t, glasses=True, glow=glow, walk=True)
        R(d, x + 12, 222, 6, 9, (30, 30, 40))
        R(d, x + 13, 223, 4, 6, (60, 170, 240))
    elif sc == "crew":
        anchor = person(d, 130, 228, "mika", t, glasses=True, glow=glow, talk=t > dur * 0.4)
        for i, (nm, col) in enumerate((("CHIEF", (52, 245, 126)), ("DEV", (120, 200, 255)), ("AUDIT", (255, 214, 120)))):
            bx = 250 + i * 70
            by = 190 + int(math.sin(t * 2 + i) * 2)
            R(d, bx, by, 24, 22, (190, 196, 210))
            R(d, bx + 4, by + 6, 6, 6, col)
            R(d, bx + 14, by + 6, 6, 6, col)
            R(d, bx + 8, by + 16, 8, 2, (60, 66, 80))
            R(d, bx + 11, by - 5, 2, 5, (190, 196, 210))
            R(d, bx + 10, by - 7, 4, 3, col)
            if t > dur * (0.2 + 0.2 * i):
                R(d, bx + 8, by + 26, 8, 2, col)
                R(d, bx + 6, by + 24, 2, 2, col)
    elif sc == "night":
        anchor = person(d, 100, 228, "mika", t, glasses=True, glow=glow * 0.6, look=1)
    elif sc == "recording":
        img = Image.new("RGB", (GW, GH), (10, 14, 12))
        d = ImageDraw.Draw(img)
        for y in range(0, GH, 8):
            R(d, 0, y, GW, 1, (14, 20, 17))
    return img, anchor


# ---------------------------------------------------------------- overlays
def hud_for(scene, frac, t):
    seg = None
    for p, a, b in scene["hud"]:
        if a <= frac < b or (frac >= 1.0 and b == 1.0):
            seg = (p, a, b)
    if not seg:
        return None, 0
    p, a, b = seg
    if p == "RING":
        n = int(t * 6) % 3 + 1
        p = os.path.join(SIM, f"sim-live-ring-{n}.png")
    local = (frac - a) / max(0.001, b - a)
    return p, local


_hud_cache = {}


def load_hud(path, scale):
    key = (path, scale)
    if key not in _hud_cache:
        raw = Image.open(path).convert("RGBA")  # green-on-transparent: composite over black like the real lens
        im = Image.alpha_composite(Image.new("RGBA", raw.size, (0, 0, 0, 255)), raw).convert("RGB")
        _hud_cache[key] = im.resize((int(im.width * scale), int(im.height * scale)), Image.Resampling.NEAREST)
    return _hud_cache[key]


def compose(scene, t, dur, rec_frames):
    sc = scene["id"]
    grid, anchor = draw_scene(sc, t, dur)
    frame = grid.resize((W, H), Image.Resampling.NEAREST)
    d = ImageDraw.Draw(frame, "RGBA")
    # scanlines
    for y in range(0, H, S * 2):
        d.line([0, y, W, y], fill=(0, 0, 0, 22))

    if scene["clock"]:
        gd = ImageDraw.Draw(frame)
        pixel_text(gd, 36, 36, scene["clock"], 12, GREEN if sc in ("night", "crew", "dusk") else (20, 40, 30))
    if scene["title"]:
        d.rectangle([W - 760, 30, W - 30, 82], fill=(0, 0, 0, 170), outline=GREEN + (255,), width=2)
        d.text((W - 744, 42), scene["title"], font=F_TITLE, fill=(230, 255, 240))

    frac = t / dur
    hud_path, local = hud_for(scene, frac, t)
    if hud_path and os.path.exists(hud_path):
        pop = min(1.0, local * 6 + 0.35) if local < 0.17 else 1.0
        hw = int(540 * (0.82 + 0.18 * pop))
        scale = hw / 576
        hud = load_hud(hud_path, round(scale, 3))
        hx, hy = W - hud.width - 60, 120
        d.rectangle([hx - 14, hy - 14, hx + hud.width + 14, hy + hud.height + 14], fill=(0, 0, 0, 255), outline=GREEN + (255,), width=4)
        frame.paste(hud, (hx, hy))
        lab_y = hy + hud.height + 22
        d.rectangle([hx - 14, lab_y - 6, hx + hud.width + 14, lab_y + 34], fill=(0, 0, 0, 220))
        d.text((hx, lab_y), "REAL EVENHUB SIMULATOR 0.9.5 CAPTURE", font=F_SM, fill=(160, 255, 200))
        if anchor:
            ax, ay = anchor[0] * S, anchor[1] * S
            steps = 28
            for i in range(steps):
                if (i + int(t * 10)) % 2 == 0:
                    k0, k1 = i / steps, (i + 1) / steps
                    d.line([ax + (hx - 14 - ax) * k0, ay + (hy + hud.height // 2 - ay) * k0,
                            ax + (hx - 14 - ax) * k1, ay + (hy + hud.height // 2 - ay) * k1], fill=GREEN + (230,), width=4)

    if sc == "title":
        k = min(1.0, t / 1.2)
        d.text((W // 2 - 120, 110), "A DAY WITH", font=F_MID, fill=(210, 255, 230, int(255 * k)))
        d.text((W // 2 - 150, 170), "OnQ", font=font(190), fill=GREEN + (int(255 * k),))
        d.text((W // 2 - 520, 400), "Pixel story. Real captures. Even Realities G2.", font=F_MID, fill=(190, 210, 200, int(255 * k)))
    if sc == "hallway" and dur * 0.12 < t < dur * 0.34:
        _bubble(d, 520, 560, "Push 15m and tell Priya")
    if sc == "meeting" and int(t / 3) % 3 == 0 and t > 4:
        _bubble(d, 880, 380, "OnQ, wrap up.")
    if sc == "cafe" and t < dur * 0.4:
        _bubble(d, 280, 620, "Can we do 14:45?")
    if sc == "morning" and 2.2 < t < 6:
        _bubble(d, 560, 360, "Good morning, OnQ.")
    if sc == "recording" and rec_frames:
        i = min(len(rec_frames) - 1, int(t * 15))
        rec = Image.open(rec_frames[i]).convert("RGB")
        rx, ry = (W - rec.width) // 2, 110
        d.rectangle([rx - 18, ry - 18, rx + rec.width + 18, ry + rec.height + 18], fill=(0, 0, 0, 255), outline=GREEN + (255,), width=6)
        frame.paste(rec, (rx, ry))
        d.rectangle([rx - 18, ry + rec.height + 22, rx + rec.width + 18, ry + rec.height + 66], fill=(0, 0, 0, 220))
        d.text((rx, ry + rec.height + 30), "REAL SCREEN RECORDING OF THE ONQ WEB APP (DEMO SANDBOX)", font=F_SM, fill=(160, 255, 200))
    if sc == "night" and t > dur * 0.18:
        cards = [("251", "TESTS PASS"), ("32/32", "EVAL INTENTS"), ("11/11", "DISPLAY GATES"), ("10/10", "SECURITY"), ("13", "SIM CAPTURES")]
        for i, (big, small) in enumerate(cards):
            k = min(1.0, (t - dur * 0.18 - i * 0.35) * 2.2)
            if k <= 0:
                continue
            x, y = 760 + (i % 3) * 370, 330 + (i // 3) * 210
            d.rectangle([x, y, x + 340, y + 170], fill=(0, 0, 0, int(210 * k)), outline=GREEN + (int(255 * k),), width=3)
            d.text((x + 20, y + 20), big, font=F_BIG, fill=GREEN + (int(255 * k),))
            d.text((x + 22, y + 124), small, font=F_SM, fill=(210, 255, 230, int(255 * k)))
        if t > dur * 0.62:
            d.rectangle([740, 750, 1880, 900], fill=(0, 0, 0, 200))
            d.text((760, 762), "Verified in the simulator.", font=F_MID, fill=(255, 226, 150, 255))
            d.text((760, 818), "Physical G2 test: next.", font=F_MID, fill=(255, 226, 150, 255))
            d.text((760, 868), "github.com/vaibhav4046/onq-even-g2", font=F_SM, fill=(190, 210, 200, 255))
    # captions (burned-in subtitles)
    vo = scene.get("vo")
    if vo:
        sents = [s.strip() for s in vo.replace(". ", ".|").split("|") if s.strip()]
        idx = min(len(sents) - 1, int(frac * len(sents)))
        lines = textwrap.wrap(sents[idx], 70)[:2]
        d.rectangle([0, H - 150, W, H], fill=(0, 0, 0, 190))
        for i, ln in enumerate(lines):
            d.text((60, H - 130 + i * 48), ln, font=F_CAP, fill=(240, 250, 244))
    return frame


def _bubble(d, x, y, text):
    w = d.textlength(text, font=F_BUBBLE) + 48
    d.rounded_rectangle([x, y, x + w, y + 70], radius=14, fill=(255, 255, 255, 245), outline=(20, 30, 25, 255), width=4)
    d.polygon([(x + 30, y + 70), (x + 60, y + 70), (x + 24, y + 104)], fill=(255, 255, 255, 245), outline=(20, 30, 25, 255))
    d.text((x + 24, y + 14), text, font=F_BUBBLE, fill=(20, 30, 25))


# ---------------------------------------------------------------- audio
def synth_vo(text, out_wav):
    if os.path.exists(out_wav) and os.path.getsize(out_wav) > 4096:
        return True
    r = subprocess.run(["node", os.path.join(ROOT, "scripts", "tts-vo-helper.mjs"), "--text", text, "--voice", "aai-kyla", "--out", out_wav],
                       cwd=ROOT, capture_output=True, text=True, timeout=60)
    return r.returncode == 0 and os.path.exists(out_wav)


def wav_to_np(path):
    with wave.open(path, "rb") as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        raw = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
    if ch == 2:
        raw = raw.reshape(-1, 2).mean(axis=1)
    if sr != SR:
        x = np.linspace(0, len(raw) - 1, int(len(raw) * SR / sr))
        raw = np.interp(x, np.arange(len(raw)), raw)
    return raw


def pad(total_s):
    t = np.arange(int(total_s * SR)) / SR
    chords = [(220, 277.2, 329.6), (196, 246.9, 293.7), (174.6, 220, 261.6), (196, 246.9, 311.1)]
    sig = np.zeros_like(t)
    seg = 8.0
    for k in range(int(total_s // seg) + 1):
        a, b = int(k * seg * SR), min(len(t), int((k + 1) * seg * SR))
        if a >= len(t):
            break
        c = chords[k % len(chords)]
        tt = t[a:b]
        env = np.minimum(1, (tt - tt[0]) * 0.8) * np.minimum(1, (tt[-1] - tt) * 0.8)
        for f in c:
            sig[a:b] += np.sin(2 * np.pi * f * tt) * env * (0.5 + 0.5 * np.sin(2 * np.pi * 0.15 * tt)) * 0.04
    return sig


def blip(buf, at, f=880, dur=0.12, vol=0.12):
    n = int(dur * SR)
    a = int(at * SR)
    if a + n > len(buf):
        return
    tt = np.arange(n) / SR
    buf[a:a + n] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 18) * vol


# ---------------------------------------------------------------- main
STATIC = {}


def main():
    preview = "--preview" in sys.argv
    for s in SCENES:
        if s["id"] in ("morning", "hallway", "meeting", "cafe", "dusk", "crew", "night"):
            STATIC[s["id"]] = bg_static(s["id"])

    # narration
    for s in SCENES:
        s["vo_path"] = None
        s["dur"] = s["min_s"]
        if s["vo"] and not preview:
            p = os.path.join(WORK, f"vo_{s['id']}.wav")
            if not synth_vo(s["vo"], p):
                raise SystemExit(f"TTS failed for scene {s['id']}")
            s["vo_path"] = p
            with wave.open(p, "rb") as w:
                s["vo_len"] = w.getnframes() / w.getframerate()
            s["dur"] = max(s["min_s"], s["vo_len"] + 2.2)

    # real screen recording frames, trimmed past the loading screen
    rec_frames = []
    clip = os.path.join(ROOT, "media", "raw", "clip2_live_walkthrough.webm")
    side = clip + ".ready.json"
    if os.path.exists(clip):
        ready_s = 0.0
        if os.path.exists(side):
            ready_s = json.load(open(side))["readyMs"] / 1000.0
        fdir = os.path.join(WORK, "rec")
        os.makedirs(fdir, exist_ok=True)
        for f in os.listdir(fdir):
            os.remove(os.path.join(fdir, f))
        subprocess.run([FF, "-y", "-i", clip, "-vf", "fps=15,scale=1280:720", "-q:v", "3",
                        os.path.join(fdir, "r_%04d.jpg")], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        allf = sorted(os.path.join(fdir, f) for f in os.listdir(fdir))
        if os.path.exists(side):
            rec_frames = allf[int((ready_s + 0.8) * 15):][:210]
        else:
            # No ready marker: the clip always ends with Talk Now -> Confirm -> receipt (about 8 s), never the loading screen.
            rec_frames = allf[-165:]

    if preview:
        for s in SCENES:
            s["dur"] = s["min_s"]
            f = compose(s, s["dur"] * 0.55, s["dur"], rec_frames)
            f.save(os.path.join(WORK, f"preview-{s['id']}.png"))
        print("[anime] previews written to", WORK)
        return

    total = sum(s["dur"] for s in SCENES)
    nframes = int(total * FPS)
    silent = os.path.join(WORK, "video_only.mp4")
    enc = subprocess.Popen(
        [FF, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", silent],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    starts = []
    acc = 0.0
    for s in SCENES:
        starts.append(acc)
        acc += s["dur"]
    fade = 10
    fi = 0
    for si, s in enumerate(SCENES):
        n = int(s["dur"] * FPS)
        for k in range(n):
            t = k / FPS
            fr = compose(s, t, s["dur"], rec_frames)
            edge = min(k, n - 1 - k)
            if edge < fade:
                fr = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), fr, edge / fade)
            enc.stdin.write(fr.tobytes())
            fi += 1
        print(f"[anime] scene {s['id']} done ({fi}/{nframes})", flush=True)
    enc.stdin.close()
    enc.wait()

    # audio mix
    buf = pad(total) * 1.0
    for s, st in zip(SCENES, starts):
        if s.get("vo_path"):
            v = wav_to_np(s["vo_path"])
            a = int((st + 0.6) * SR)
            buf[a:a + len(v)] += v[: len(buf) - a] * 0.95
        if s["id"] == "hallway":
            blip(buf, st + s["dur"] * 0.36, 660)
            blip(buf, st + s["dur"] * 0.7, 988, 0.2, 0.16)
        if s["id"] == "cafe":
            blip(buf, st + 1.0, 180, 0.3, 0.2)
        if s["id"] == "morning":
            blip(buf, st + 3.0, 1318, 0.15, 0.1)
    buf = np.clip(buf, -1, 1)
    wav_path = os.path.join(WORK, "mix.wav")
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((buf * 32767).astype(np.int16).tobytes())
    subprocess.run([FF, "-y", "-i", silent, "-i", wav_path, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", OUT],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"[anime:DONE] {OUT} ({total:.1f}s)")


if __name__ == "__main__":
    main()
