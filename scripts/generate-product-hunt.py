import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOT_DIR = os.path.join(ROOT, "docs", "screenshots")
PH_DIR = os.path.join(ROOT, "media", "product-hunt")
os.makedirs(PH_DIR, exist_ok=True)

C_INK = (0, 0, 0)
C_SURFACE = (11, 11, 11)
C_BRIGHT = (242, 242, 242)
C_GRAY = (138, 138, 138)
C_HAIR = (55, 56, 58)
C_LIME = (218, 255, 82)
C_G2 = (52, 245, 126)
C_DANGER = (255, 90, 79)
C_VERIFIED = (45, 212, 191)


def load_font(size: int, bold: bool = False):
    for p in [
        r"C:\Windows\Fonts\consolab.ttf" if bold else r"C:\Windows\Fonts\consola.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


F_BIG = load_font(54, True)
F_MED = load_font(30, True)
F_MONO = load_font(20, False)
F_TAG = load_font(16, True)


def paste_shot(canvas: Image.Image, draw: ImageDraw.ImageDraw, fname: str, x: int, y: int, w: int, h: int, label: str) -> None:
    p = os.path.join(SHOT_DIR, fname)
    draw.rectangle([x - 8, y - 34, x + w + 8, y + h + 8], fill=C_SURFACE, outline=C_HAIR, width=2)
    draw.text((x, y - 26), label, font=F_TAG, fill=C_LIME)
    if os.path.exists(p):
        rgba = Image.open(p).convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (0, 0, 0, 255))
        img = Image.alpha_composite(bg, rgba).convert("RGB").resize((w, h), Image.Resampling.NEAREST)
        canvas.paste(img, (x, y))
    draw.rectangle([x, y, x + w, y + h], outline=C_G2, width=2)


def make_card(filename: str, eyebrow: str, headline: str, shot_a: tuple[str, str], shot_b: tuple[str, str], bullets: list[str]) -> None:
    img = Image.new("RGB", (1270, 760), C_INK)
    d = ImageDraw.Draw(img)
    d.rectangle([24, 24, 1246, 736], outline=C_HAIR, width=2)
    d.text((56, 52), eyebrow, font=F_TAG, fill=C_LIME)
    d.text((56, 84), headline, font=F_BIG, fill=C_BRIGHT)

    paste_shot(img, d, shot_a[0], 56, 200, 560, 280, shot_a[1])
    paste_shot(img, d, shot_b[0], 654, 200, 560, 280, shot_b[1])

    d.line([(56, 525), (1214, 525)], fill=C_HAIR, width=2)
    for i, b in enumerate(bullets):
        d.text((56, 555 + i * 44), f"-> {b}", font=F_MONO, fill=C_VERIFIED if i == 0 else C_BRIGHT)

    img.save(os.path.join(PH_DIR, filename))


def make_thumbnail_gif() -> None:
    frames: list[Image.Image] = []
    for step in range(12):
        im = Image.new("RGB", (240, 240), C_INK)
        d = ImageDraw.Draw(im)
        d.rectangle([6, 6, 234, 234], outline=C_HAIR, width=2)
        end_deg = -90 + int(360 * (step + 1) / 12)
        d.ellipse([44, 34, 196, 186], outline=(30, 50, 35), width=14)
        d.arc([44, 34, 196, 186], start=-90, end=end_deg, fill=C_G2, width=14)
        d.text((64, 198), "ONQ G2", font=F_TAG, fill=C_LIME)
        frames.append(im)
    frames[0].save(
        os.path.join(PH_DIR, "thumbnail-240x240.gif"),
        save_all=True,
        append_images=frames[1:],
        duration=110,
        loop=0,
    )


def main() -> None:
    make_card(
        "gallery-01-hero.png",
        "ONQ · EVEN REALITIES G2 · TRACK 04",
        "Own the 90 seconds between meetings.",
        ("sim-01-dossier.png", "REAL SIMULATOR: CORRIDOR DOSSIER"),
        ("sim-06-receipt-done.png", "REAL SIMULATOR: AFTER-ACTION RECEIPT"),
        [
            "Reads Google Calendar, Gmail, Drive, and Notion into one 42-col glance.",
            "Executes voice-staged updates behind Default-NO + 2.0s 4-bit PNG Undo Ring.",
            "Zero phone juggling in the hallway; >= 70% dark transparent waveguide pixels.",
        ],
    )
    make_card(
        "gallery-02-conflict-lock.png",
        "SAFETY MOAT · HTTP 409 HARD-LOCK + CODE-GUARD",
        "Zero double-bookings. Zero rogue sends.",
        ("sim-04-preview-no.png", "DEFAULT-NO CONFIRM DIFF"),
        ("sim-07-conflict-409.png", "HTTP 409 CONFLICT HARD-LOCK"),
        [
            "Re-queries live Calendar Free/Busy & Gmail historyId synchronously at commit.",
            "Blocks overlapping moves (HTTP 409) and suggests the next verified free slot.",
            "Code-Guard binds recipients from server metadata and blocks prompt injections.",
        ],
    )
    make_card(
        "gallery-03-voice-pack.png",
        "LOCAL 16KHZ WHISPER + NOTION AUTO-SCHEMA",
        "4-second voice capture to Action Pack.",
        ("sim-03-detail.png", "R1 RING ACTION PICKER"),
        ("sim-05-armed-ring.png", "76x76 4-BIT PNG UNDO RING"),
        [
            "Defensive PCM slice() buffer + RMS silence gate (silent taps never reach Whisper).",
            "Auto-discovers Notion checkbox or status databases with zero template setup.",
            "Synchronously locks inputs at 0.0s boundary with SHA-256 idempotency.",
        ],
    )
    make_card(
        "gallery-04-architecture.png",
        "OPEN-SOURCE VERIFIED · ZERO KEYS IN WEBVIEW",
        "130 tests + 11/11 Geometry Gate.",
        ("web-companion-desktop.png", "KANECLI-INSPIRED WEB OPTICAL SIMULATOR"),
        ("geometry-stale_offline.png", "HONEST STALE OFFLINE FALLBACK"),
        [
            "External Phone Pairing Console with 6-digit code (15m TTL, 10-try lockout).",
            "AES-256-GCM 0600 local token vault + deterministic Rules fallback.",
            "Fresh clone passes npm ci && npm test && npm run build && npm run pack cold.",
        ],
    )
    make_thumbnail_gif()

    copy_md = """# Product Hunt Launch Kit - OnQ

## Tagline (58 chars)
Own the 90 seconds between meetings on Even Realities G2.

## Short Description
OnQ puts one private 42-column glance on your Even Realities G2 smart glasses across Google Calendar, Gmail, Drive, and Notion. Speak once into local 16 kHz Whisper, review a Default-NO diff, arm the 2.0s optical Undo Ring, and get a verified receipt protected by an HTTP 409 Conflict Hard-Lock.

## Topics
Artificial Intelligence, Productivity, Developer Tools, Wearables

## Maker First Comment
Hey Product Hunt!

I built OnQ for the Heads Up: Even Realities G2 Hackathon (Track 04: AI Assistants & Work) to solve the most annoying daily bottleneck for founders, engineers, and operators: the 90-second corridor between back-to-back meetings.

Instead of shrinking a phone dashboard onto 576x288 monochrome optics, OnQ enforces strict waveguide discipline:
- One 42-column card answering who you are meeting, what they just asked in Gmail, and the linked Drive or Notion note.
- Real 16 kHz PCM local Whisper STT behind an RMS silence gate so accidental pocket/temple presses never transcribe room noise.
- A 4-Layer Deterministic Safety Gate: Default-NO preview, Commit-Locked 2.0s 4-bit PNG Undo Ring, live Calendar Free/Busy + Gmail historyId HTTP 409 Hard-Lock, and a Code-Guard fact verifier that blocks AI-invented emails or prompt injections.

You can test the entire loop in 10 seconds in the browser 576x288 optical simulator with zero API keys, or pair your own Google Workspace + Notion database locally with encrypted mode-0600 storage.

(Honest note: tested end-to-end in Even Hub Simulator 0.9.5 and our 11-check Chromium Geometry Gate; physical Even G2 + R1 ring hardware testing is pending.)
"""
    with open(os.path.join(PH_DIR, "PRODUCT_HUNT_LAUNCH_COPY.md"), "w", encoding="utf-8") as f:
        f.write(copy_md)
    print("[product-hunt] Exported 4 gallery PNGs, 240x240 GIF thumbnail, and launch copy.")


if __name__ == "__main__":
    main()
