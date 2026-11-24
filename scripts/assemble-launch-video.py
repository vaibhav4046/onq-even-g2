import json
import os
import re
import subprocess
import tempfile
import textwrap
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

ROOT = os.getcwd()
RAW_DIR = os.path.join(ROOT, "media", "raw")
SIM_DIR = os.path.join(RAW_DIR, "sim")
AUDIO_DIR = os.path.join(ROOT, "media", "audio")
OUT_DIR = os.path.join(ROOT, "media", "out")
os.makedirs(OUT_DIR, exist_ok=True)

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H = 1920, 1080


def load_font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        [r"C:\Windows\Fonts\consolab.ttf", r"C:\Windows\Fonts\consola.ttf"]
        if mono
        else [r"C:\Windows\Fonts\bahnschrift.ttf", r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arialbd.ttf"]
        if bold
        else [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"]
    )
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size=size)
    return ImageFont.load_default()


def probe_duration(path: str) -> float:
    proc = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", proc.stderr)
    if not m:
        return 15.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def make_opening_slate(path: str) -> None:
    img = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(60, H - 140, 28):
        for x in range(80, W - 80, 28):
            d.point((x, y), fill=(40, 40, 44))

    f_eyebrow = load_font(22, bold=True, mono=True)
    f_h1 = load_font(84, bold=True)
    f_sub = load_font(30)
    f_stat = load_font(22, mono=True)

    d.text((130, 190), "ONQ // EVEN REALITIES G2 · TRACK 04", fill=(218, 255, 82), font=f_eyebrow)
    d.text((130, 250), "Own the 90 seconds", fill=(160, 160, 168), font=f_h1)
    d.text((130, 350), "between meetings.", fill=(242, 242, 242), font=f_h1)
    d.text(
        (130, 480),
        "Calendar, Gmail, Drive, and Notion fused into 42 optical columns.",
        fill=(200, 200, 205),
        font=f_sub,
    )

    d.rectangle([130, 590, W - 130, 770], fill=(12, 12, 14), outline=(55, 56, 58), width=2)
    d.text((165, 622), "PUBLISHED PROBLEM EVIDENCE", fill=(218, 255, 82), font=f_eyebrow)
    d.text(
        (165, 668),
        "Microsoft Work Trend Index (2023-2025): 275 daily interruptions, 55% unclear next steps",
        fill=(242, 242, 242),
        font=f_stat,
    )
    d.text(
        (165, 706),
        "Mark, Gudith & Klocke (UC Irvine, CHI 2008): context switches elevate stress & time pressure",
        fill=(170, 174, 182),
        font=f_stat,
    )
    img.save(path)


def make_closing_slate(path: str) -> None:
    img = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(60, H - 60, 28):
        for x in range(80, W - 80, 28):
            d.point((x, y), fill=(36, 36, 40))

    f_eyebrow = load_font(22, bold=True, mono=True)
    f_h1 = load_font(66, bold=True)
    f_big = load_font(52, bold=True, mono=True)
    f_title = load_font(28, bold=True)
    f_desc = load_font(20, mono=True)
    f_body = load_font(24, mono=True)

    d.text((130, 140), "VERIFIED, NOT CLAIMED · CLEAN-ROOM REPRODUCIBLE", fill=(218, 255, 82), font=f_eyebrow)
    d.text((130, 195), "Ready to run cold with zero paid keys.", fill=(242, 242, 242), font=f_h1)

    cards = [
        ("163 / 163", "Automated Tests", "113 core + 50 server, live API, Postgres, and fault tests"),
        ("11 / 11", "Geometry Gate", "9 lens states <= 999B plus Negative Control gate"),
        ("10 / 10", "Security Audit", "Zero secrets in source, web bundle, or onq.ehpk"),
        ("$7 / mo", "Pro Economics", "~$0.001 per brief with rules first and optional LLM"),
    ]
    cw = 395
    gap = 26
    y0, y1 = 340, 625
    for idx, (num, title, desc) in enumerate(cards):
        x0 = 130 + idx * (cw + gap)
        x1 = x0 + cw
        outline = (218, 255, 82) if idx == 0 else (55, 56, 58)
        d.rectangle([x0, y0, x1, y1], fill=(12, 12, 14), outline=outline, width=2)
        d.text((x0 + 26, y0 + 28), num, fill=(218, 255, 82), font=f_big)
        d.text((x0 + 26, y0 + 112), title, fill=(242, 242, 242), font=f_title)
        wrapped = textwrap.wrap(desc, width=29)
        for li, line in enumerate(wrapped[:3]):
            d.text((x0 + 26, y0 + 162 + li * 30), line, fill=(165, 168, 176), font=f_desc)

    d.rectangle([130, 695, W - 130, 840], fill=(16, 22, 6), outline=(218, 255, 82), width=2)
    d.text((165, 727), "CLONE, VERIFY & SIDELOAD", fill=(218, 255, 82), font=f_eyebrow)
    d.text(
        (165, 769),
        "npm ci && npm test && npm run build && npm run pack   ->   dist/onq.ehpk (SDK 0.0.16)",
        fill=(242, 242, 242),
        font=f_body,
    )
    img.save(path)


def make_stage_frame(
    path: str,
    step_num: str,
    label: str,
    sub: str,
    sim_img_path: str | None = None,
    pip_title: str = "EVENHUB SIMULATOR 0.9.5 · DEMO",
    pip_note: str = "Direct unmodified hardware runtime capture",
) -> None:
    """
    Creates an unobstructed 1920x1080 RGBA frame:
    - Top header bar (0..64): dark chrome with track badge (zero occlusion)
    - Center stage (64..952): transparent window over main browser video (either full 16:9 or left 1344x756 beside right telemetry panel)
    - Bottom caption bar (964..1056): clean chapter pill & single-line context
    """
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # Top sleek black strip (0..56)
    d.rectangle([0, 0, W, 56], fill=(0, 0, 0, 255))
    d.line([0, 56, W, 56], fill=(42, 44, 48, 255), width=1)
    d.text((48, 18), "ONQ // LIVE PRODUCT RECORDING", fill=(218, 255, 82, 255), font=load_font(18, bold=True, mono=True))
    d.text((W - 430, 18), "SANDBOX: DEMO  |  LIVE RELAY: 127.0.0.1:8787", fill=(154, 158, 166, 255), font=load_font(16, mono=True))

    # Right dedicated Simulator panel when sim_img_path is supplied (zero overlap with web UI!)
    if sim_img_path and os.path.exists(sim_img_path):
        d.rectangle([1400, 57, W, 954], fill=(6, 6, 8, 255))
        d.line([1400, 57, 1400, 954], fill=(55, 56, 58, 255), width=2)

        px, py = 1424, 150
        pw, ph = 468, 234
        d.text((px, py - 58), "OFFICIAL HARDWARE RUNTIME", fill=(154, 158, 166, 255), font=load_font(16, bold=True, mono=True))
        d.text((px, py - 34), pip_title, fill=(52, 245, 126, 255), font=load_font(18, bold=True, mono=True))
        d.rectangle([px - 4, py - 4, px + pw + 4, py + ph + 4], fill=(0, 0, 0, 255), outline=(52, 245, 126, 255), width=2)
        sim_im = Image.open(sim_img_path).convert("RGBA").resize((pw, ph), Image.Resampling.NEAREST)
        ov.paste(sim_im, (px, py))

        # Status callout card under the simulator lens
        cy = py + ph + 28
        d.rectangle([px, cy, px + pw, cy + 160], fill=(12, 12, 14, 255), outline=(55, 56, 58, 255), width=1)
        d.text((px + 18, cy + 20), "OPTICAL TELEMETRY SPEC", fill=(218, 255, 82, 255), font=load_font(16, bold=True, mono=True))
        for idx, note_line in enumerate(textwrap.wrap(pip_note, width=40)[:3]):
            d.text((px + 18, cy + 56 + idx * 30), note_line, fill=(224, 226, 232, 255), font=load_font(18, mono=True))

    # Dedicated bottom editorial caption bar (954..1080) — solid obsidian so zero buttons peek behind!
    d.rectangle([0, 954, W, H], fill=(0, 0, 0, 255))
    d.line([0, 954, W, 954], fill=(55, 56, 58, 255), width=1)
    d.rectangle([48, 974, W - 48, 1054], fill=(10, 10, 12, 255), outline=(55, 56, 58, 255), width=2)
    d.rectangle([62, 986, 128, 1042], fill=(218, 255, 82, 255))
    d.text((79, 999), step_num, fill=(10, 10, 10, 255), font=load_font(24, bold=True, mono=True))
    d.text((152, 987), label, fill=(242, 242, 242, 255), font=load_font(24, bold=True))
    d.text((152, 1020), sub, fill=(168, 172, 180, 255), font=load_font(19, mono=True))

    ov.save(path)


def render_image_segment(img_path: str, out_mp4: str, duration: float, overlay_path: str | None = None) -> None:
    if overlay_path:
        cmd = [
            FFMPEG, "-y", "-loop", "1", "-t", f"{duration:.3f}", "-i", img_path,
            "-loop", "1", "-t", f"{duration:.3f}", "-i", overlay_path,
            "-filter_complex", "[0:v][1:v]overlay=0:0,fps=60,format=yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-an", out_mp4,
        ]
    else:
        cmd = [
            FFMPEG, "-y", "-loop", "1", "-t", f"{duration:.3f}", "-i", img_path,
            "-vf", "fps=60,format=yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-an", out_mp4,
        ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def render_video_segment(
    src_webm: str,
    out_mp4: str,
    target_dur: float,
    overlay_path: str,
    has_sidebar: bool,
    ss_frac: float = 0.0,
    to_frac: float = 1.0,
) -> None:
    src_total = probe_duration(src_webm)
    ss = src_total * ss_frac
    slice_dur = max(0.5, src_total * (to_frac - ss_frac))
    speed = slice_dur / max(0.5, target_dur)
    pts_factor = 1.0 / min(1.35, max(0.55, speed))

    if has_sidebar:
        # Place main browser capture cleanly on left (1344x756 centered vertically between y=56 and y=954 -> y=126)
        vf = (
            f"color=c=black:s=1920x1080:r=60[bg];"
            f"[0:v]setpts={pts_factor:.4f}*PTS,fps=60,scale=1344:756:force_original_aspect_ratio=decrease[app];"
            f"[bg][app]overlay=28:126[stage];"
            f"[stage][1:v]overlay=0:0,format=yuv420p[v]"
        )
    else:
        # Full-width centered inside y=56..954 (height 898 -> 1596x898 centered at x=162, y=56)
        vf = (
            f"color=c=black:s=1920x1080:r=60[bg];"
            f"[0:v]setpts={pts_factor:.4f}*PTS,fps=60,scale=1596:898:force_original_aspect_ratio=decrease[app];"
            f"[bg][app]overlay=(W-w)/2:56[stage];"
            f"[stage][1:v]overlay=0:0,format=yuv420p[v]"
        )

    cmd = [
        FFMPEG, "-y", "-ss", f"{ss:.3f}", "-t", f"{slice_dur:.3f}", "-i", src_webm,
        "-loop", "1", "-t", f"{target_dur:.3f}", "-i", overlay_path,
        "-filter_complex", vf, "-map", "[v]", "-t", f"{target_dur:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-an", out_mp4,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> None:
    with open(os.path.join(AUDIO_DIR, "timeline.json"), encoding="utf-8") as f:
        meta = json.load(f)
    chapters = meta["chapters"]
    total_dur = float(meta["total_duration_s"])

    temp_dir = tempfile.mkdtemp(prefix="onq_vid_")
    open_slate = os.path.join(temp_dir, "open.png")
    close_slate = os.path.join(temp_dir, "close.png")
    make_opening_slate(open_slate)
    make_closing_slate(close_slate)

    c1_dur = chapters[0]["clip_end"] - chapters[0]["clip_start"]
    c2_dur = chapters[1]["clip_end"] - chapters[1]["clip_start"]
    c3_dur = chapters[2]["clip_end"] - chapters[2]["clip_start"]
    c4_dur = chapters[3]["clip_end"] - chapters[3]["clip_start"]
    c5_dur = total_dur - chapters[4]["clip_start"]

    segs = []

    ov_1a = os.path.join(temp_dir, "ov1a.png")
    make_stage_frame(ov_1a, "01", chapters[0]["title"], chapters[0]["caption"])
    s_1a = os.path.join(temp_dir, "seg_1a.mp4")
    render_image_segment(open_slate, s_1a, 6.2, ov_1a)
    segs.append(s_1a)

    ov_1b = os.path.join(temp_dir, "ov1b.png")
    make_stage_frame(ov_1b, "01", "Live 3D Even G2 Waveguide + Safety Scroll Story", "Interactive 3D G2 & R1 geometry built offline with Motion scroll choreography")
    s_1b = os.path.join(temp_dir, "seg_1b.mp4")
    render_video_segment(os.path.join(RAW_DIR, "clip1_hero_story.webm"), s_1b, c1_dur - 6.2, ov_1b, False, 0.0, 1.0)
    segs.append(s_1b)

    ov_2 = os.path.join(temp_dir, "ov2.png")
    make_stage_frame(
        ov_2, "02", chapters[1]["title"], chapters[1]["caption"],
        os.path.join(SIM_DIR, "sim-live-dossier.png"),
        "EVENHUB SIMULATOR 0.9.5 · DEMO",
        "State: READ Dossier | 7 lines, <= 42 cols, <= 999 UTF-8 bytes, >= 97% black optical field.",
    )
    s_2 = os.path.join(temp_dir, "seg_2.mp4")
    render_video_segment(os.path.join(RAW_DIR, "clip2_live_walkthrough.webm"), s_2, c2_dur, ov_2, True, 0.0, 0.34)
    segs.append(s_2)

    t3a = round(c3_dur * 0.32, 3)
    t3b = round(c3_dur * 0.34, 3)
    t3c = round(c3_dur - t3a - t3b, 3)

    ov_3a = os.path.join(temp_dir, "ov3a.png")
    make_stage_frame(
        ov_3a, "03", "Default-NO Preview Stage (45s TTL)", "Cursor locks strictly to [NO - CANCEL] until swiped with R1",
        os.path.join(SIM_DIR, "sim-live-preview-no.png"),
        "EVENHUB SIMULATOR 0.9.5 · DEMO",
        "State: CONFIRM_NO | Voice stages immutable diff; recipient binds strictly server-side.",
    )
    s_3a = os.path.join(temp_dir, "seg_3a.mp4")
    render_video_segment(os.path.join(RAW_DIR, "clip2_live_walkthrough.webm"), s_3a, t3a, ov_3a, True, 0.34, 0.56)
    segs.append(s_3a)

    ov_3b = os.path.join(temp_dir, "ov3b.png")
    make_stage_frame(
        ov_3b, "03", "2.0s 4-Bit PNG Optical Countdown Ring", "Any R1 tap aborts with zero writes; 0.0s locks inputs synchronously",
        os.path.join(SIM_DIR, "sim-live-ring-2.png"),
        "EVENHUB SIMULATOR 0.9.5 · DEMO",
        "State: ARMED | 76x76 Gray8 PNG ring sweeping at <= 4 Hz beside SHA-256 idempotency token.",
    )
    s_3b = os.path.join(temp_dir, "seg_3b.mp4")
    render_video_segment(os.path.join(RAW_DIR, "clip2_live_walkthrough.webm"), s_3b, t3b, ov_3b, True, 0.56, 0.78)
    segs.append(s_3b)

    ov_3c = os.path.join(temp_dir, "ov3c.png")
    make_stage_frame(
        ov_3c, "03", "Atomic Write Receipt via Live SSE", "Google Calendar shifts 14:00->14:15, Gmail replies in-thread, Receipt Ledger updates",
        os.path.join(SIM_DIR, "sim-live-receipt.png"),
        "EVENHUB SIMULATOR 0.9.5 · DEMO",
        "State: COMMITTED | Single execution + 30s surgical undo reversal window available.",
    )
    s_3c = os.path.join(temp_dir, "seg_3c.mp4")
    render_video_segment(os.path.join(RAW_DIR, "clip2_live_walkthrough.webm"), s_3c, t3c, ov_3c, True, 0.78, 1.0)
    segs.append(s_3c)

    ov_4 = os.path.join(temp_dir, "ov4.png")
    make_stage_frame(
        ov_4, "04", chapters[3]["title"], chapters[3]["caption"],
        os.path.join(SIM_DIR, "sim-live-409.png"),
        "EVENHUB SIMULATOR 0.9.5 · DEMO",
        "State: HTTP 409 CONFLICT_CALENDAR_BUSY | Blocks double-booking and suggests 15:45 free slot.",
    )
    s_4 = os.path.join(temp_dir, "seg_4.mp4")
    render_video_segment(os.path.join(RAW_DIR, "clip3_conflict_and_notion.webm"), s_4, c4_dur, ov_4, True, 0.0, 1.0)
    segs.append(s_4)

    t5a = round(c5_dur * 0.58, 3)
    t5b = round(c5_dur - t5a, 3)

    ov_5a = os.path.join(temp_dir, "ov5a.png")
    make_stage_frame(ov_5a, "05", chapters[4]["title"], "RMS silence gate drops false taps (0 STT calls) · Honest STALE offline badge · 54-entry audit matrix")
    s_5a = os.path.join(temp_dir, "seg_5a.mp4")
    render_video_segment(os.path.join(RAW_DIR, "clip4_failures_and_proof.webm"), s_5a, t5a, ov_5a, False, 0.0, 1.0)
    segs.append(s_5a)

    s_5b = os.path.join(temp_dir, "seg_5b.mp4")
    render_image_segment(close_slate, s_5b, t5b)
    segs.append(s_5b)

    concat_txt = os.path.join(temp_dir, "concat.txt")
    with open(concat_txt, "w", encoding="utf-8") as f:
        for s in segs:
            f.write(f"file '{s.replace(chr(92), '/')}'\n")

    vid_only = os.path.join(temp_dir, "video_only.mp4")
    subprocess.run(
        [FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", concat_txt, "-c", "copy", vid_only],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    out_mp4 = os.path.join(OUT_DIR, "onq-launch-demo.mp4")
    master_wav = os.path.join(AUDIO_DIR, "launch_master.wav")
    subprocess.run(
        [
            FFMPEG, "-y", "-i", vid_only, "-i", master_wav,
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-shortest", "-movflags", "+faststart", out_mp4,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    final_dur = probe_duration(out_mp4)
    for idx, frac in enumerate([0.03, 0.16, 0.36, 0.54, 0.72, 0.94], start=1):
        ts = max(0.5, final_dur * frac)
        frame_out = os.path.join(OUT_DIR, f"frame-check-{idx}.png")
        subprocess.run(
            [FFMPEG, "-y", "-ss", f"{ts:.2f}", "-i", out_mp4, "-vframes", "1", frame_out],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    size_mb = os.path.getsize(out_mp4) / (1024 * 1024)
    print(f"[video:DONE] Rendered {out_mp4} ({final_dur:.2f}s, {size_mb:.2f} MB, 1920x1080 @ 60fps)")


if __name__ == "__main__":
    main()
