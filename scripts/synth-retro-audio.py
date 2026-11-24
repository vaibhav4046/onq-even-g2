import math
import os
import subprocess
import wave
import numpy as np
import imageio_ffmpeg

SR = 48000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "media", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)


def save_wav_stereo(path: str, left: np.ndarray, right: np.ndarray | None = None) -> None:
    if right is None:
        right = left
    l = np.clip(left, -0.98, 0.98)
    r = np.clip(right, -0.98, 0.98)
    stereo = np.stack([l, r], axis=1)
    pcm = (stereo * 32767.0).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def env_exp(n: int, attack_s: float = 0.005, decay: float = 8.0) -> np.ndarray:
    t = np.arange(n, dtype=np.float64) / SR
    atk = np.minimum(1.0, t / max(attack_s, 1e-4))
    return atk * np.exp(-decay * t)


def synth_tone(freq: float, dur_s: float, wave_type: str = "square", amp: float = 0.4, decay: float = 7.0) -> np.ndarray:
    n = int(SR * dur_s)
    t = np.arange(n, dtype=np.float64) / SR
    phase = 2.0 * np.pi * freq * t
    if wave_type == "square":
        sig = np.sign(np.sin(phase)) * 0.7 + np.sin(phase) * 0.3
    elif wave_type == "triangle":
        sig = 2.0 * np.abs(2.0 * ((freq * t) % 1.0) - 1.0) - 1.0
    elif wave_type == "saw":
        sig = 2.0 * ((freq * t) % 1.0) - 1.0
    else:
        sig = np.sin(phase)
    return sig * env_exp(n, 0.004, decay) * amp


def generate_sfx() -> dict[str, np.ndarray]:
    sfx: dict[str, np.ndarray] = {}

    # 1. Boot chime (C5 E5 G5 C6)
    boot = np.zeros(int(SR * 0.65), dtype=np.float64)
    for idx, f in enumerate([523.25, 659.25, 783.99, 1046.50]):
        start = int(idx * 0.08 * SR)
        tone = synth_tone(f, 0.32, "square", 0.25, 9.0)
        end = min(len(boot), start + len(tone))
        boot[start:end] += tone[: end - start]
    sfx["sfx_boot"] = boot

    # 2. Ring mechanical tick
    n_tick = int(SR * 0.045)
    t_tick = np.arange(n_tick) / SR
    rng = np.random.default_rng(42)
    click = np.sin(2 * np.pi * 1850 * t_tick) * np.exp(-90 * t_tick) * 0.35
    click += rng.normal(0, 0.08, n_tick) * np.exp(-120 * t_tick)
    sfx["sfx_ring_tick"] = click

    # 3. Mic open sonar ping
    p1 = synth_tone(660.0, 0.12, "sine", 0.35, 14.0)
    p2 = synth_tone(990.0, 0.18, "sine", 0.35, 11.0)
    mic = np.zeros(int(SR * 0.30))
    mic[: len(p1)] += p1
    mic[int(SR * 0.09) : int(SR * 0.09) + len(p2)] += p2
    sfx["sfx_mic_open"] = mic

    # 4. Arm 4Hz pulse
    sfx["sfx_arm_pulse"] = synth_tone(880.0, 0.09, "sine", 0.30, 22.0)

    # 5. Commit OK chord (C5 + E5 + G5 + D6)
    commit = np.zeros(int(SR * 0.55))
    for i, f in enumerate([523.25, 659.25, 783.99, 1174.66]):
        t = synth_tone(f, 0.45, "triangle", 0.24, 6.0)
        off = int(i * 0.025 * SR)
        end = min(len(commit), off + len(t))
        commit[off:end] += t[: end - off]
    sfx["sfx_commit_ok"] = commit

    # 6. Undo / Cancel chirp
    undo = np.zeros(int(SR * 0.26))
    u1 = synth_tone(740.0, 0.11, "triangle", 0.30, 14.0)
    u2 = synth_tone(440.0, 0.15, "triangle", 0.30, 12.0)
    undo[: len(u1)] += u1
    undo[int(SR * 0.09) : int(SR * 0.09) + len(u2)] += u2
    sfx["sfx_undo_cancel"] = undo

    # 7. Conflict 409 buzz (155Hz + 130Hz square double buzz)
    buzz = np.zeros(int(SR * 0.42))
    b1 = synth_tone(155.0, 0.14, "square", 0.34, 10.0)
    b2 = synth_tone(128.0, 0.20, "square", 0.34, 8.0)
    buzz[: len(b1)] += b1
    buzz[int(SR * 0.18) : int(SR * 0.18) + len(b2)] += b2
    sfx["sfx_conflict_409"] = buzz

    # 8. Pixel transition whoosh
    n_w = int(SR * 0.22)
    tw = np.arange(n_w) / SR
    noise = rng.normal(0, 0.18, n_w) * np.sin(np.pi * tw / 0.22)
    sweep = np.sin(2 * np.pi * (240 + 1600 * (tw / 0.22)) * tw) * 0.12 * np.exp(-7 * tw)
    sfx["sfx_whoosh_pixel"] = noise + sweep

    for name, arr in sfx.items():
        save_wav_stereo(os.path.join(AUDIO_DIR, f"{name}.wav"), arr)
    return sfx


def synth_music_bed(duration_s: float = 152.0) -> tuple[np.ndarray, np.ndarray]:
    bpm = 124.0
    step_s = 60.0 / bpm / 4.0  # 16th note (~0.12097s)
    total_samples = int(SR * duration_s)
    left = np.zeros(total_samples, dtype=np.float64)
    right = np.zeros(total_samples, dtype=np.float64)
    rng = np.random.default_rng(7)

    # Am - F - C - G chord roots & arpeggios
    chords = [
        (110.00, [220.00, 261.63, 329.63, 440.00]),  # Am
        (87.31,  [174.61, 220.00, 261.63, 349.23]),  # F
        (130.81, [261.63, 329.63, 392.00, 523.25]),  # C
        (98.00,  [196.00, 246.94, 293.66, 392.00]),  # G
    ]

    total_steps = int(duration_s / step_s)
    for step in range(total_steps):
        pos = int(step * step_s * SR)
        if pos >= total_samples:
            break
        bar = (step // 16) % 4
        beat_step = step % 16
        root_f, arp_notes = chords[bar]

        # Driving synthwave 16th bass
        bass_f = root_f if beat_step % 4 != 2 else root_f * 2.0
        bass = synth_tone(bass_f, 0.11, "triangle", 0.24, 15.0)
        end = min(total_samples, pos + len(bass))
        left[pos:end] += bass[: end - pos]
        right[pos:end] += bass[: end - pos]

        # Phosphor arpeggio pluck (alternating stereo width)
        arp_f = arp_notes[step % len(arp_notes)]
        if step % 2 == 0 or beat_step in (3, 7, 11, 15):
            pluck = synth_tone(arp_f * 2.0, 0.14, "square", 0.085, 16.0)
            end_p = min(total_samples, pos + len(pluck))
            pan_l = 0.65 if step % 2 == 0 else 0.35
            pan_r = 1.0 - pan_l
            left[pos:end_p] += pluck[: end_p - pos] * pan_l
            right[pos:end_p] += pluck[: end_p - pos] * pan_r

        # Punchy kick on 0, 4, 8, 12
        if beat_step % 4 == 0:
            nk = int(SR * 0.14)
            tk = np.arange(nk) / SR
            kf = 135.0 * np.exp(-26.0 * tk) + 46.0
            kick = np.sin(2.0 * np.pi * np.cumsum(kf) / SR) * np.exp(-13.0 * tk) * 0.36
            ek = min(total_samples, pos + nk)
            left[pos:ek] += kick[: ek - pos]
            right[pos:ek] += kick[: ek - pos]

        # Snare on 4 and 12
        if beat_step in (4, 12):
            ns = int(SR * 0.12)
            ts = np.arange(ns) / SR
            sn = (rng.normal(0, 0.20, ns) * np.exp(-22.0 * ts)) + (
                np.sin(2 * np.pi * 190 * ts) * np.exp(-30.0 * ts) * 0.18
            )
            es = min(total_samples, pos + ns)
            left[pos:es] += sn[: es - pos]
            right[pos:es] += sn[: es - pos]

        # Closed hi-hat on offbeats
        if beat_step % 2 == 1:
            nh = int(SR * 0.04)
            th = np.arange(nh) / SR
            hh = rng.normal(0, 0.06, nh) * np.exp(-75.0 * th)
            eh = min(total_samples, pos + nh)
            left[pos:eh] += hh[: eh - pos] * 0.7
            right[pos:eh] += hh[: eh - pos] * 0.9

    # Gentle fade in & fade out
    fade_in = int(SR * 0.8)
    fade_out = int(SR * 2.5)
    left[:fade_in] *= np.linspace(0.0, 1.0, fade_in)
    right[:fade_in] *= np.linspace(0.0, 1.0, fade_in)
    left[-fade_out:] *= np.linspace(1.0, 0.0, fade_out)
    right[-fade_out:] *= np.linspace(1.0, 0.0, fade_out)
    return left, right


def main() -> None:
    sfx = generate_sfx()
    dur_s = 152.0
    left, right = synth_music_bed(dur_s)
    save_wav_stereo(os.path.join(AUDIO_DIR, "music_bed.wav"), left, right)

    # Timeline-synced SFX cues matching render-launch-video.py chapters (0:00 -> 2:32)
    cues: list[tuple[float, str, float]] = [
        (0.4, "sfx_boot", 0.95),
        (16.0, "sfx_whoosh_pixel", 0.75),
        (22.0, "sfx_ring_tick", 0.80),
        (30.0, "sfx_ring_tick", 0.80),
        (46.0, "sfx_whoosh_pixel", 0.75),
        (50.0, "sfx_mic_open", 0.90),
        (60.0, "sfx_ring_tick", 0.80),
        (65.0, "sfx_arm_pulse", 0.75),
        (65.5, "sfx_arm_pulse", 0.75),
        (66.0, "sfx_arm_pulse", 0.75),
        (66.5, "sfx_arm_pulse", 0.75),
        (67.2, "sfx_commit_ok", 1.00),
        (86.0, "sfx_whoosh_pixel", 0.75),
        (92.0, "sfx_conflict_409", 0.95),
        (103.0, "sfx_mic_open", 0.85),
        (109.0, "sfx_commit_ok", 0.95),
        (114.0, "sfx_whoosh_pixel", 0.75),
        (120.0, "sfx_undo_cancel", 0.85),
        (134.0, "sfx_whoosh_pixel", 0.75),
        (149.0, "sfx_boot", 0.90),
    ]

    for sec, name, gain in cues:
        arr = sfx[name] * gain
        idx = int(sec * SR)
        end = min(len(left), idx + len(arr))
        if idx < len(left):
            left[idx:end] += arr[: end - idx]
            right[idx:end] += arr[: end - idx]

    raw_master = os.path.join(AUDIO_DIR, "master_raw.wav")
    final_master = os.path.join(AUDIO_DIR, "master_audio.wav")
    save_wav_stereo(raw_master, left, right)

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [
            ffmpeg_exe,
            "-y",
            "-i",
            raw_master,
            "-af",
            "loudnorm=I=-14:TP=-1.5:LRA=11",
            "-ar",
            "48000",
            "-ac",
            "2",
            final_master,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"[audio] Synthesized 8 SFX + music_bed.wav + normalized master_audio.wav ({dur_s}s)")


if __name__ == "__main__":
    main()
