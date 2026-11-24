import json
import sys
import time


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing WAV path"}), file=sys.stderr)
        sys.exit(2)
    wav_path = sys.argv[1]
    t0 = time.time()
    from faster_whisper import WhisperModel

    def run_transcribe(device: str) -> tuple[str, str]:
        model = WhisperModel("tiny.en", device=device, compute_type="int8")
        segments, info = model.transcribe(wav_path, beam_size=1, vad_filter=True)
        txt = " ".join(seg.text.strip() for seg in segments).strip()
        return txt, getattr(info, "language", "en")

    try:
        text, lang = run_transcribe("auto")
    except RuntimeError:
        # Fallback cleanly to int8 CPU when CUDA Toolkit / cublas64_12.dll is absent
        text, lang = run_transcribe("cpu")

    elapsed_ms = int((time.time() - t0) * 1000)
    print(
        json.dumps(
            {
                "transcript": text,
                "language": lang,
                "duration_ms": elapsed_ms,
            }
        )
    )


if __name__ == "__main__":
    main()
