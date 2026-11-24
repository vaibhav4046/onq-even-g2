import math
import os
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOT_DIR = os.path.join(ROOT, "docs", "screenshots")
AUDIO_MASTER = os.path.join(ROOT, "media", "audio", "master_audio.wav")
OUT_DIR = os.path.join(ROOT, "media", "out")
os.makedirs(OUT_DIR, exist_ok=True)

W, H = 1920, 1080
FPS = 60
DURATION_S = 152.0
TOTAL_FRAMES = int(FPS * DURATION_S)

# KaneCLI + Even G2 Palette
C_INK = (0, 0, 0)
C_SURFACE = (11, 11, 11)
C_BRIGHT = (242, 242, 242)
C_GRAY = (138, 138, 138)
C_HAIR = (55, 56, 58)
C_LIME = (218, 255, 82)
C_G2 = (52, 245, 126)
C_WARN = (255, 176, 32)
C_DANGER = (255, 90, 79)
C_VERIFIED = (45, 212, 191)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        r"C:\Windows\Fonts\consolab.ttf" if bold else r"C:\Windows\Fonts\consola.ttf",
        r"C:\Windows\Fonts\lucon.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


F_HERO = load_font(78, True)
F_H2 = load_font(52, True)
F_H3 = load_font(34, True)
F_BODY = load_font(26, False)
F_MONO = load_font(22, False)
F_TAG = load_font(18, True)


def load_sim_shot(name: str) -> Image.Image | None:
    p = os.path.join(SHOT_DIR, name)
    if os.path.exists(p):
        rgba = Image.open(p).convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (0, 0, 0, 255))
        return Image.alpha_composite(bg, rgba).convert("RGB")
    return None


def draw_dashed_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: tuple[int, int, int], dash: int = 10) -> None:
    x0, y0, x1, y1 = box
    for x in range(x0, x1, dash * 2):
        draw.line([(x, y0), (min(x + dash, x1), y0)], fill=color, width=2)
        draw.line([(x, y1), (min(x + dash, x1), y1)], fill=color, width=2)
    for y in range(y0, y1, dash * 2):
        draw.line([(x0, y), (x0, min(y + dash, y1))], fill=color, width=2)
        draw.line([(x1, y), (x1, min(y + dash, y1))], fill=color, width=2)


def draw_pixel_ring(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, progress: float, color: tuple[int, int, int]) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=C_HAIR, width=8)
    end_deg = -90 + int(360 * max(0.0, min(1.0, progress)))
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=-90, end=end_deg, fill=color, width=10)
    draw.rectangle([cx - 5, cy - 5, cx + 5, cy + 5], fill=color)


def make_scanline_overlay() -> np.ndarray:
    arr = np.ones((H, W, 1), dtype=np.float32)
    arr[1::4, :, 0] = 0.94
    return arr


def draw_header_bar(draw: ImageDraw.ImageDraw, chapter: str, t_sec: float) -> None:
    draw.rectangle([0, 0, W, 72], fill=C_INK)
    draw.line([(0, 72), (W, 72)], fill=C_HAIR, width=2)
    # Pixel G2 glasses mark
    draw.rectangle([60, 22, 92, 50], outline=C_LIME, width=3)
    draw.rectangle([104, 22, 136, 50], outline=C_LIME, width=3)
    draw.rectangle([92, 33, 104, 39], fill=C_BRIGHT)
    draw.text((158, 24), "ONCUE // EVEN REALITIES G2", font=F_TAG, fill=C_BRIGHT)
    draw.text((780, 24), chapter, font=F_TAG, fill=C_LIME)
    mins = int(t_sec // 60)
    secs = int(t_sec % 60)
    draw.text((1740, 24), f"{mins:02d}:{secs:02d} / 02:32", font=F_TAG, fill=C_GRAY)


def draw_footer_caption(draw: ImageDraw.ImageDraw, subtitle: str) -> None:
    draw.rectangle([0, H - 96, W, H], fill=C_INK)
    draw.line([(0, H - 96), (W, H - 96)], fill=C_HAIR, width=2)
    draw.text((64, H - 64), subtitle, font=F_BODY, fill=C_BRIGHT)


def paste_sim_bezel(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    sim_img: Image.Image | None,
    x: int,
    y: int,
    scale: float,
    badge: str,
) -> None:
    sw = int(576 * scale)
    sh = int(288 * scale)
    # Outer bezel
    draw.rectangle([x - 16, y - 48, x + sw + 16, y + sh + 16], fill=C_SURFACE, outline=C_HAIR, width=2)
    draw.rectangle([x - 16, y - 48, x + sw + 16, y - 8], fill=C_INK)
    draw.text((x, y - 38), badge, font=F_TAG, fill=C_LIME)
    if sim_img is not None:
        resized = sim_img.resize((sw, sh), Image.Resampling.NEAREST)
        canvas.paste(resized, (x, y))
    else:
        draw.rectangle([x, y, x + sw, y + sh], fill=C_INK)
        draw.text((x + 24, y + 40), "EVENHUB SIMULATOR 576x288", font=F_H3, fill=C_G2)
    draw.rectangle([x, y, x + sw, y + sh], outline=C_G2, width=2)


def main() -> None:
    if not os.path.exists(AUDIO_MASTER):
        raise FileNotFoundError(f"Missing {AUDIO_MASTER}. Run scripts/synth-retro-audio.py first.")

    shots = {
        "dossier": load_sim_shot("sim-01-dossier.png") or load_sim_shot("geometry-dossier.png"),
        "card2": load_sim_shot("sim-02-card2.png") or load_sim_shot("geometry-detail.png"),
        "detail": load_sim_shot("sim-03-detail.png") or load_sim_shot("geometry-detail.png"),
        "preview": load_sim_shot("sim-04-preview-no.png") or load_sim_shot("geometry-preview_default_no.png"),
        "armed": load_sim_shot("sim-05-armed-ring.png") or load_sim_shot("geometry-armed_ring.png"),
        "receipt": load_sim_shot("sim-06-receipt-done.png") or load_sim_shot("geometry-receipt_done.png"),
        "conflict": load_sim_shot("sim-07-conflict-409.png") or load_sim_shot("geometry-conflict_409.png"),
        "stale": load_sim_shot("geometry-stale_offline.png"),
        "web": load_sim_shot("web-companion-desktop.png"),
    }

    out_mp4 = os.path.join(OUT_DIR, "oncue-launch-demo.mp4")
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_exe,
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-s",
        f"{W}x{H}",
        "-pix_fmt",
        "rgb24",
        "-r",
        str(FPS),
        "-i",
        "pipe:0",
        "-i",
        AUDIO_MASTER,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        out_mp4,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    scanlines = make_scanline_overlay()

    # Pre-bake background dot-grid once instead of redrawing 9,120 times
    bg_template = Image.new("RGB", (W, H), C_INK)
    bg_draw = ImageDraw.Draw(bg_template)
    for gx in range(80, W, 120):
        for gy in range(110, H - 110, 120):
            bg_draw.rectangle([gx, gy, gx + 2, gy + 2], fill=(28, 32, 30))

    cached_key = None
    cached_bytes = b""

    try:
        for frame_idx in range(TOTAL_FRAMES):
            t = frame_idx / FPS
            in_ring_sweep = 64.5 <= t < 67.2
            # Cache key: per-frame during 2.7s ring sweep, per-second (MM:SS tick) everywhere else
            key = ("ring", frame_idx) if in_ring_sweep else ("sec", int(t), int(t * 2) if t < 16 else 0)
            if key == cached_key:
                proc.stdin.write(cached_bytes)
                continue

            canvas = bg_template.copy()
            draw = ImageDraw.Draw(canvas)

            if t < 16.0:
                # Chapter 1: The 90-Second Corridor Hook
                draw_header_bar(draw, "01 // THE 90-SECOND CORRIDOR", t)
                draw.text((84, 150), "OWN THE 90 SECONDS", font=F_HERO, fill=C_GRAY)
                draw.text((84, 240), "BETWEEN MEETINGS.", font=F_HERO, fill=C_BRIGHT)
                draw.rectangle([84, 355, 680, 415], fill=C_LIME)
                draw.text((104, 370), "TRACK 04 · EVEN REALITIES G2 + WORKSPACE", font=F_TAG, fill=C_INK)

                # Three broken phone apps -> One G2 glance
                boxes = [
                    ("GCAL", "14:00 VC Sync in 12m", 84),
                    ("GMAIL", "Priya: Push 15m?", 420),
                    ("DRIVE + NOTION", "Q4_Metrics_v3 + Task", 756),
                ]
                for label, txt, bx in boxes:
                    draw_dashed_rect(draw, (bx, 470, bx + 300, 610), C_HAIR)
                    draw.text((bx + 20, 494), label, font=F_TAG, fill=C_LIME)
                    draw.text((bx + 20, 536), txt, font=F_MONO, fill=C_BRIGHT)

                paste_sim_bezel(
                    canvas,
                    draw,
                    shots["dossier"],
                    1120,
                    290,
                    1.25,
                    "REAL EVENHUB-SIMULATOR 0.9.5 CAPTURE · DEMO",
                )
                draw_footer_caption(
                    draw,
                    "One 42-column private glance across Calendar, Gmail, Drive, and Notion.",
                )

            elif t < 46.0:
                # Chapter 2: Corridor Dossier (READ)
                draw_header_bar(draw, "02 // CORRIDOR DOSSIER (READ)", t)
                active_shot = shots["card2"] if (t >= 26.0 and t < 36.0) else shots["dossier"]
                paste_sim_bezel(
                    canvas,
                    draw,
                    active_shot,
                    80,
                    190,
                    1.55,
                    "REAL EVENHUB-SIMULATOR 0.9.5 · 576x288 WAVEGUIDE",
                )

                # Right side: Live Workspace Sources + Optical Budget telemetry
                draw_dashed_rect(draw, (1030, 142, 1840, 880), C_HAIR)
                draw.text((1065, 172), "READ FUSION + OPTICS BUDGET", font=F_H3, fill=C_LIME)
                items = [
                    ("CALENDAR", "14:00 VC Sync - Priya Nair (12m)"),
                    ("GMAIL ASK", "Can we push 15m? Q4 deck ready?"),
                    ("DRIVE DOC", "Q4_Metrics_v3 | 2 unresolved comments"),
                    ("OPTICAL", "42 cols | <= 999 UTF-8 bytes | >= 70% black"),
                    ("SDK FIX", "Proto3 sysEvent omitted-0 -> CLICK_EVENT"),
                ]
                for idx, (k, v) in enumerate(items):
                    yy = 245 + idx * 115
                    draw.line([(1065, yy), (1805, yy)], fill=C_HAIR, width=2)
                    draw.text((1065, yy + 18), k, font=F_TAG, fill=C_VERIFIED)
                    draw.text((1065, yy + 50), v, font=F_MONO, fill=C_BRIGHT)
                draw_footer_caption(
                    draw,
                    "R1 ring scrolls prioritized cards. Zero dashboards. >= 70% transparent black glass.",
                )

            elif t < 86.0:
                # Chapter 3: Voice -> Default-NO -> 2.0s PNG Undo Ring -> Receipt (WRITE)
                draw_header_bar(draw, "03 // VOICE + 2.0s UNDO RING + RECEIPT (WRITE)", t)
                if t < 58.0:
                    shot = shots["detail"]
                    stage_lbl = "STEP 1: 16KHZ PCM VOICE + RMS SILENCE GATE"
                elif t < 64.5:
                    shot = shots["preview"]
                    stage_lbl = "STEP 2: DEFAULT-NO DIFF PREVIEW (VOICE NEVER AUTO-SENDS)"
                elif t < 67.2:
                    shot = shots["armed"]
                    stage_lbl = "STEP 3: 76x76 4-BIT PNG 2.0s UNDO RING (TAP = CANCEL)"
                else:
                    shot = shots["receipt"]
                    stage_lbl = "STEP 4: SYNCHRONOUS 0.0s COMMIT LOCK -> VERIFIED RECEIPT"

                paste_sim_bezel(canvas, draw, shot, 80, 195, 1.52, stage_lbl)

                # Right panel: live ring progress / receipt confirmation
                draw_dashed_rect(draw, (1015, 145, 1840, 880), C_HAIR)
                if t >= 64.5 and t < 67.2:
                    prog = (t - 64.5) / 2.7
                    draw_pixel_ring(draw, 1425, 420, 130, prog, C_G2)
                    draw.text((1265, 590), f"ARMED · {max(0.0, 2.0 * (1 - prog)):.1f}s", font=F_H2, fill=C_LIME)
                    draw.text((1140, 670), "ANY TAP = ZERO WRITES | 0.0s LOCKS INPUT", font=F_MONO, fill=C_BRIGHT)
                elif t >= 67.2:
                    draw.rectangle([1045, 175, 1810, 250], fill=C_LIME)
                    draw.text((1070, 195), "ATOMIC WRITE VERIFIED · REC #1042", font=F_H3, fill=C_INK)
                    receipts_txt = [
                        "OK  GCAL: 14:00 -> 14:15 GMT (ETag updated)",
                        "OK  GMAIL: Replied in thread to priya@tvm.example",
                        "OK  NOTION: Logged reschedule audit entry",
                        "IDEMPOTENCY: SHA-256 single-use preview token",
                    ]
                    for i, line in enumerate(receipts_txt):
                        draw.text((1060, 300 + i * 90), line, font=F_MONO, fill=C_VERIFIED if i < 3 else C_GRAY)
                else:
                    draw.text((1055, 185), "SPOKEN: \"Push 15m and tell Priya\"", font=F_H3, fill=C_LIME)
                    draw.text((1055, 255), "-> Local Whisper 16kHz PCM + chrono-node", font=F_MONO, fill=C_BRIGHT)
                    draw.text((1055, 315), "-> Code-Guard verified recipient & time", font=F_MONO, fill=C_BRIGHT)
                    draw.text((1055, 375), "-> Default selection locked to [NO - CANCEL]", font=F_MONO, fill=C_WARN)
                draw_footer_caption(
                    draw,
                    "Voice stages a Default-NO diff. Swipe to YES, arm 2.0s PNG ring, get real receipts.",
                )

            elif t < 114.0:
                # Chapter 4: 409 Conflict Hard-Lock & Hallway Action Pack
                draw_header_bar(draw, "04 // HTTP 409 CONFLICT LOCK + ACTION PACK", t)
                paste_sim_bezel(
                    canvas,
                    draw,
                    shots["conflict"],
                    80,
                    195,
                    1.52,
                    "REAL EVENHUB-SIMULATOR 0.9.5 · HTTP 409 HARD-LOCK",
                )
                draw_dashed_rect(draw, (1015, 145, 1840, 880), C_HAIR)
                draw.rectangle([1045, 175, 1810, 250], fill=C_DANGER)
                draw.text((1070, 195), "!! HTTP 409 CONFLICT_CALENDAR_BUSY", font=F_H3, fill=C_INK)
                lines = [
                    "1) Re-checks Live Free/Busy & Gmail historyId",
                    "2) Blocks overlapping move (14:45 Design Review)",
                    "3) Strips YES/ARM cues -> 0 emails sent",
                    "4) Suggests NEXT VERIFIED FREE SLOT: 15:45",
                    "",
                    "ACTION PACK: \"Task: send Q4 metrics by Thu\"",
                    "-> Auto-discovers Notion schema (checkbox/status)",
                    "-> Creates task + conflict-free 30m Cal hold",
                ]
                for i, ln in enumerate(lines):
                    draw.text((1055, 295 + i * 56), ln, font=F_MONO, fill=C_LIME if i >= 5 else C_BRIGHT)
                draw_footer_caption(
                    draw,
                    "Zero double-bookings, zero stale-thread replies, zero ungrounded AI recipients.",
                )

            elif t < 134.0:
                # Chapter 5: Engineering, Security & Geometry Proof
                draw_header_bar(draw, "05 // VERIFIED ENGINEERING & SECURITY PROOF", t)
                if shots["stale"] is not None:
                    paste_sim_bezel(canvas, draw, shots["stale"], 80, 175, 0.98, "HONEST STALE OFFLINE CACHE")
                if shots["web"] is not None:
                    web_resized = shots["web"].resize((730, 456), Image.Resampling.BILINEAR)
                    canvas.paste(web_resized, (80, 492))
                    draw.rectangle([80, 492, 810, 948], outline=C_HAIR, width=2)

                draw_dashed_rect(draw, (890, 145, 1840, 940), C_HAIR)
                draw.text((925, 175), "FRESH-CLONE VERIFICATION (ZERO KEYS)", font=F_H3, fill=C_LIME)
                proofs = [
                    "[PASS] 130 / 130 Vitest tests (105 core + 25 HTTP/fault)",
                    "[PASS] 11 / 11 Chromium 576x288 Geometry Gate",
                    "[PASS] Check 11 Negative Control catches overflow",
                    "[PASS] RMS Silence Gate rejects silent WAV (0 STT)",
                    "[PASS] 0 / 5 planted prompt injections obeyed",
                    "[PASS] AES-256-GCM 0600 Vault + 0 secrets in .ehpk",
                    "[PASS] dist/oncue.ehpk packed via evenhub-cli 0.2.0",
                ]
                for i, ptxt in enumerate(proofs):
                    draw.text((925, 255 + i * 82), ptxt, font=F_MONO, fill=C_VERIFIED)
                draw_footer_caption(
                    draw,
                    "Reproducible from fresh clone: npm ci && npm test && npm run build && npm run pack.",
                )

            else:
                # Chapter 6: Business Wedge & Launch Outro
                draw_header_bar(draw, "06 // ONCUE · TRACK 04 LAUNCH", t)
                draw.text((120, 210), "ONCUE", font=F_HERO, fill=C_LIME)
                draw.text((120, 310), "OWN THE 90 SECONDS BETWEEN MEETINGS.", font=F_H2, fill=C_BRIGHT)
                draw_dashed_rect(draw, (120, 420, 1800, 740), C_HAIR)
                cards = [
                    ("UNIT ECONOMICS", "~$0.001 / brief est.", "Target $7/mo Work-Pro tier"),
                    ("ZERO CUSTODY", "Local Whisper + 0600 vault", "Deterministic Rules fallback"),
                    ("TRY IN 10 SECONDS", "Zero-install 576x288 Browser", "Optical Simulator + .ehpk"),
                ]
                for i, (ct, l1, l2) in enumerate(cards):
                    cx = 160 + i * 540
                    draw.text((cx, 465), ct, font=F_H3, fill=C_LIME)
                    draw.text((cx, 530), l1, font=F_MONO, fill=C_BRIGHT)
                    draw.text((cx, 570), l2, font=F_MONO, fill=C_GRAY)
                draw.text((120, 810), "TRACK 04: AI ASSISTANTS & WORK · EVEN REALITIES G2 HACKATHON", font=F_TAG, fill=C_GRAY)
                draw_footer_caption(
                    draw,
                    "Physical G2 hardware testing pending. Verified end-to-end in EvenHub Simulator 0.9.5.",
                )

            # Apply crisp subtle scanlines & cache bytes
            arr = (np.asarray(canvas, dtype=np.float32) * scanlines).clip(0, 255).astype(np.uint8)
            cached_bytes = arr.tobytes()
            cached_key = key
            proc.stdin.write(cached_bytes)
    finally:
        proc.stdin.close()
        stderr = proc.stderr.read().decode("utf-8", errors="replace")
        rc = proc.wait()
        if rc != 0:
            print(stderr, file=sys.stderr)
            raise RuntimeError(f"ffmpeg exited with code {rc}")

    # Extract 6 verification frames across the rendered video
    for idx, sec in enumerate([6, 28, 66, 94, 122, 144]):
        frame_out = os.path.join(OUT_DIR, f"frame-check-{idx + 1}.png")
        subprocess.run(
            [ffmpeg_exe, "-y", "-ss", str(sec), "-i", out_mp4, "-vframes", "1", frame_out],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    size_mb = os.path.getsize(out_mp4) / (1024 * 1024)
    print(f"[video] Rendered {out_mp4} ({size_mb:.2f} MB, {DURATION_S:.0f}s @ {FPS}fps)")


if __name__ == "__main__":
    main()
