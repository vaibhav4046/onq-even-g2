import asyncio
import json
import os
import subprocess
import sys
import tempfile
import wave
import numpy as np
import imageio_ffmpeg

ROOT = os.getcwd()
AUDIO_DIR = os.path.join(ROOT, "media", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000

CHAPTERS = [
    {
        "id": "01_moment",
        "title": "Before: The 90-Second Corridor Brief",
        "caption": "275 daily interruptions (Microsoft WTI) · OnQ fuses GCal, Gmail, Drive, and Notion on Even G2",
        "text": (
            "Most focus breaks happen in the ninety seconds between meetings. "
            "Microsoft telemetry tracks over two hundred seventy interruptions a day, "
            "and pulling out a phone in a hallway breaks presence. "
            "OnQ brings Calendar, Gmail, Drive, and Notion onto Even Realities G2, "
            "before, during, and after every meeting."
        ),
        "pad_after": 1.6,
    },
    {
        "id": "02_read_voice",
        "title": "Live 576x288 Waveguide & AssemblyAI STT-3.7",
        "caption": "42-column waveguide brief · 16 kHz PCM streaming + RMS silence gate",
        "text": (
            "Here is OnQ running live beside the official Even Hub simulator. "
            "One glance shows who you are meeting, their latest Gmail question, "
            "and the linked Drive doc. Holding R1 streams sixteen kilohertz audio "
            "through our RMS silence gate and deterministic date parser."
        ),
        "pad_after": 1.4,
    },
    {
        "id": "03_safety_write",
        "title": "Default-NO & 2.0s Optical Undo Ring",
        "caption": "45s Default-NO preview -> 2.0s 4-bit PNG Undo Ring -> live SSE commit",
        "text": (
            "Voice never writes blind. Commands stage a preview locked to No, Cancel. "
            "Swiping to Yes arms a two-second countdown ring right on the waveguide. "
            "Any tap cancels with zero writes; letting it finish shifts Calendar, "
            "replies in Gmail, and writes an auditable receipt."
        ),
        "pad_after": 1.8,
    },
    {
        "id": "04_conflict_notion",
        "title": "During & After: Live Diarization, TTS-1 & 409 Lock",
        "caption": "RAM-only STT-3.7 diarization -> Companion TTS-1 answer -> Notion Wrap-Up & 409 Lock",
        "text": (
            "Inside the room, AssemblyAI diarizes speakers strictly in memory with zero audio saved. "
            "Say OnQ to answer quietly on your lens or companion earbuds via TTS-1. "
            "Saying OnQ wrap up stages Notion tasks, a Calendar hold, and Gmail recap behind a four-oh-nine conflict lock."
        ),
        "pad_after": 1.8,
    },
    {
        "id": "05_proof_close",
        "title": "One Personal OS, Kill Switch & Verified Proof",
        "caption": "268 tests · 32/32 intent eval · 5/5 injection block · 11/11 geometry · 10/10 security",
        "text": (
            "One personal OS sits behind the glasses, the web app, and Telegram. "
            "A morning crew of specialist agents runs under a global kill switch, "
            "and anything that sends waits for your approval. "
            "Accounts connect in one click and keys stay in an encrypted vault on your own machine. "
            "Verified in the simulator, not yet on physical glasses: "
            "two hundred sixty-eight automated tests, thirty-two evaluation intents with five out of five injection blocks, "
            "eleven display geometry gates, and a clean ten-domain security audit."
        ),
        "pad_after": 2.4,
    },
]


def try_assemblyai_tts1(text: str, out_wav: str) -> bool:
    helper = os.path.join(ROOT, "scripts", "tts-vo-helper.mjs")
    if not os.path.exists(helper):
        return False
    try:
        proc = subprocess.run(
            ["node", helper, "--text", text, "--voice", "aai-titus", "--out", out_wav],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=35,
        )
        return proc.returncode == 0 and os.path.exists(out_wav) and os.path.getsize(out_wav) > 4096
    except Exception:
        return False


async def try_edge_tts(text: str, out_mp3: str) -> bool:
    try:
        import edge_tts

        await edge_tts.Communicate(text, "en-US-AndrewMultilingualNeural", rate="-3%").save(out_mp3)
        return os.path.exists(out_mp3) and os.path.getsize(out_mp3) > 2048
    except Exception:
        return False


def synth_sapi_wav(text: str, out_wav: str) -> None:
    import base64

    ps_lines = [
        "Add-Type -AssemblyName System.Speech",
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        "$s.SelectVoice('Microsoft David Desktop')",
        "$s.Rate = 0",
        f'$s.SetOutputToWaveFile("{out_wav}")',
        f'$s.Speak("{text.replace(chr(34), " ")}")',
        "$s.Dispose()",
    ]
    enc = base64.b64encode("\n".join(ps_lines).encode("utf-16-le")).decode("ascii")
    subprocess.run(["powershell", "-NoProfile", "-EncodedCommand", enc], check=True)


def polish_voice(src_path: str, dst_wav: str) -> float:
    af = (
        "silenceremove=start_periods=1:start_silence=0.12:start_threshold=-45dB,"
        "highpass=f=85,"
        "lowshelf=g=3:f=150,"
        "equalizer=f=3100:t=q:w=1.4:g=2.2,"
        "lowpass=f=7600,"
        "acompressor=threshold=-18dB:ratio=2.4:attack=15:release=180,"
        "aresample=48000"
    )
    subprocess.run(
        [FFMPEG, "-y", "-i", src_path, "-af", af, "-ac", "2", "-c:a", "pcm_s16le", dst_wav],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    with wave.open(dst_wav, "rb") as w:
        return w.getnframes() / float(w.getframerate())


def make_ambient_pad(total_s: float) -> np.ndarray:
    n = int(total_s * SR)
    t = np.linspace(0, total_s, n, endpoint=False)
    out_l = np.zeros(n, dtype=np.float64)
    out_r = np.zeros(n, dtype=np.float64)

    # Calm warm minor-9 -> major-9 architectural chord cycle (zero harsh harmonics)
    chords = [
        [220.00, 261.63, 329.63, 493.88],  # Am9
        [174.61, 261.63, 329.63, 440.00],  # Fmaj7/9
        [130.81, 246.94, 293.66, 392.00],  # Cmaj9
        [196.00, 246.94, 329.63, 392.00],  # G6
    ]
    bar_s = 7.0588  # ~68 BPM, 2 bars per chord
    fade_s = 1.6

    idx = 0
    chord_i = 0
    while idx < n:
        end_idx = min(n, idx + int(bar_s * SR))
        seg_n = end_idx - idx
        st = t[idx:end_idx] - t[idx]
        seg_dur = seg_n / SR
        env = np.ones(seg_n, dtype=np.float64)
        f_n = min(seg_n // 3, int(fade_s * SR))
        if f_n > 0:
            env[:f_n] = 0.5 * (1 - np.cos(np.pi * np.arange(f_n) / f_n))
            env[-f_n:] = 0.5 * (1 - np.cos(np.pi * (f_n - np.arange(f_n)) / f_n))

        freqs = chords[chord_i % len(chords)]
        sig_l = np.zeros(seg_n, dtype=np.float64)
        sig_r = np.zeros(seg_n, dtype=np.float64)
        for fi, f in enumerate(freqs):
            detune = 1.0018 if fi % 2 else 0.9985
            p = np.sin(2 * np.pi * f * st) * 0.55 + np.sin(2 * np.pi * (f * 0.5) * st) * 0.25
            p_r = np.sin(2 * np.pi * f * detune * st) * 0.55 + np.sin(2 * np.pi * (f * 0.5) * st) * 0.25
            pan = 0.38 + 0.08 * fi
            sig_l += p * (1.0 - pan * 0.4)
            sig_r += p_r * (0.6 + pan * 0.4)

        out_l[idx:end_idx] += sig_l * env * 0.032
        out_r[idx:end_idx] += sig_r * env * 0.032
        idx = end_idx
        chord_i += 1

    # Global 2s fade-in / 3s fade-out
    fin = int(1.8 * SR)
    fout = int(3.0 * SR)
    if fin < n:
        out_l[:fin] *= np.linspace(0, 1, fin)
        out_r[:fin] *= np.linspace(0, 1, fin)
    if fout < n:
        out_l[-fout:] *= np.linspace(1, 0, fout)
        out_r[-fout:] *= np.linspace(1, 0, fout)
    return np.stack([out_l, out_r], axis=1)


def add_tactile_cue(buf: np.ndarray, at_s: float, kind: str) -> None:
    idx = int(at_s * SR)
    if idx < 0 or idx >= len(buf):
        return
    if kind == "tick":
        dur = 0.025
        n = min(int(dur * SR), len(buf) - idx)
        st = np.arange(n) / SR
        w = np.sin(2 * np.pi * 1240 * st) * np.exp(-st * 160) * 0.09
    elif kind == "confirm":
        dur = 0.28
        n = min(int(dur * SR), len(buf) - idx)
        st = np.arange(n) / SR
        w = (np.sin(2 * np.pi * 587.33 * st) + 0.6 * np.sin(2 * np.pi * 880 * st)) * np.exp(-st * 11) * 0.065
    elif kind == "lock":
        dur = 0.22
        n = min(int(dur * SR), len(buf) - idx)
        st = np.arange(n) / SR
        w = np.sin(2 * np.pi * 220 * st) * np.exp(-st * 14) * 0.09
    else:
        return
    buf[idx : idx + n, 0] += w
    buf[idx : idx + n, 1] += w


def read_stereo_wav(path: str) -> np.ndarray:
    with wave.open(path, "rb") as w:
        raw = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768.0
        return raw.reshape(-1, 2)


def main() -> None:
    temp_dir = tempfile.mkdtemp(prefix="onq_audio_")
    edge_ok = True
    tts1_count = 0
    cur_t = 1.0  # 1.0s calm breathing opening before first narration
    timeline = []
    speech_tracks = []

    for i, ch in enumerate(CHAPTERS):
        raw_path = os.path.join(temp_dir, f"{ch['id']}.mp3")
        wav_path = os.path.join(AUDIO_DIR, f"vo_{ch['id']}.wav")
        raw_tts1_wav = os.path.join(temp_dir, f"{ch['id']}_tts1.wav")

        if try_assemblyai_tts1(ch["text"], raw_tts1_wav):
            raw_path = raw_tts1_wav
            tts1_count += 1
        else:
            used_edge = False
            if edge_ok:
                used_edge = asyncio.run(try_edge_tts(ch["text"], raw_path))
                if not used_edge:
                    edge_ok = False
                    print("[audio] AssemblyAI/edge-tts unavailable; using tuned Windows SAPI studio chain cleanly.")
            if not used_edge:
                raw_wav = os.path.join(temp_dir, f"{ch['id']}_sapi.wav")
                synth_sapi_wav(ch["text"], raw_wav)
                raw_path = raw_wav

        dur_s = polish_voice(raw_path, wav_path)
        start_s = round(cur_t, 3)
        end_s = round(cur_t + dur_s, 3)
        slot_end = round(end_s + ch["pad_after"], 3)

        timeline.append(
            {
                "id": ch["id"],
                "title": ch["title"],
                "caption": ch["caption"],
                "vo_start": start_s,
                "vo_end": end_s,
                "clip_start": 0.0 if i == 0 else timeline[-1]["clip_end"],
                "clip_end": slot_end,
            }
        )
        speech_tracks.append((start_s, read_stereo_wav(wav_path)))
        print(f"[audio] {ch['id']}: {start_s:.2f}s -> {end_s:.2f}s (slot end {slot_end:.2f}s)")
        cur_t = slot_end + 0.4

    total_duration = round(cur_t + 1.5, 2)
    mix = make_ambient_pad(total_duration)

    # Duck ambient bed cleanly during speech, then add full-clarity speech & understated hardware cues
    duck = np.ones(len(mix), dtype=np.float64)
    for start_s, arr in speech_tracks:
        s_idx = int(start_s * SR)
        e_idx = min(len(mix), s_idx + len(arr))
        pad_pre = max(0, s_idx - int(0.25 * SR))
        pad_post = min(len(mix), e_idx + int(0.35 * SR))
        duck[pad_pre:pad_post] = 0.35

    mix *= duck[:, None]
    for start_s, arr in speech_tracks:
        s_idx = int(start_s * SR)
        e_idx = min(len(mix), s_idx + len(arr))
        mix[s_idx:e_idx] += arr[: e_idx - s_idx] * 0.88

    # Place subtle UI micro-cues aligned with chapters (confirm chime in Ch 3, lock thud in Ch 4, ticks)
    if len(timeline) >= 5:
        add_tactile_cue(mix, timeline[1]["vo_start"] + 4.0, "tick")
        add_tactile_cue(mix, timeline[2]["vo_end"] - 0.5, "confirm")
        add_tactile_cue(mix, timeline[3]["vo_start"] + 6.5, "lock")
        add_tactile_cue(mix, timeline[4]["vo_start"] + 1.2, "tick")

    raw_mix = os.path.join(temp_dir, "raw_mix.wav")
    clipped = np.clip(mix, -0.95, 0.95)
    pcm = (clipped * 32767.0).astype(np.int16)
    with wave.open(raw_mix, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())

    master_wav = os.path.join(AUDIO_DIR, "launch_master.wav")
    subprocess.run(
        [
            FFMPEG,
            "-y",
            "-i",
            raw_mix,
            "-af",
            "loudnorm=I=-14:TP=-1.5:LRA=11",
            "-ar",
            str(SR),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            master_wav,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    voice_label = "assemblyai-tts-1" if tts1_count == len(CHAPTERS) else ("edge-tts" if edge_ok else "sapi-david-eq")
    meta = {"total_duration_s": total_duration, "voice_engine": voice_label, "chapters": timeline}
    with open(os.path.join(AUDIO_DIR, "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"[audio:DONE] Built {master_wav} ({total_duration:.2f}s, voice={meta['voice_engine']})")


if __name__ == "__main__":
    main()
