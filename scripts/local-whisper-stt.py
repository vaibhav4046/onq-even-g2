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

    model = WhisperModel("tiny.en", device="auto", compute_type="int8")
    segments, info = model.transcribe(wav_path, beam_size=1, vad_filter=True)
    text = " ".join(seg.text.strip() for seg in segments).strip()
    elapsed_ms = int((time.time() - t0) * 1000)
    print(
        json.dumps(
            {
                "transcript": text,
                "language": getattr(info, "language", "en"),
                "duration_ms": elapsed_ms,
            }
        )
    )


if __name__ == "__main__":
    main()
