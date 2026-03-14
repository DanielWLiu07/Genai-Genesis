"""Audio analysis pipeline: BPM, beat timestamps, energy curve, section boundaries."""
import io
import os
import tempfile
import logging

logger = logging.getLogger(__name__)


def analyze_audio(audio_bytes: bytes, filename: str) -> dict:
    """
    Analyse an audio file and return structured data.

    Returns:
        {
            bpm: float,
            beat_timestamps: list[float],   # seconds
            energy_curve: list[float],      # normalised 0-1, one value per second
            section_boundaries: list[float],# seconds
            duration_s: float,
            sample_rate: int,
        }
    """
    try:
        import librosa
        import numpy as np
    except ImportError as e:
        raise RuntimeError(
            "librosa is required for audio analysis. "
            "Run: pip install librosa soundfile"
        ) from e

    suffix = os.path.splitext(filename)[1] or ".tmp"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        # Load mono at native sample rate for accuracy
        y, sr = librosa.load(tmp_path, sr=None, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        hop_length = 512

        # --- BPM & beat timestamps ---
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
        bpm = float(np.atleast_1d(tempo)[0])
        beat_timestamps = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length).tolist()

        # --- Energy curve (RMS, normalised, 1 value / second) ---
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        frame_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
        target_times = np.arange(0.0, duration, 1.0)
        energy_interp = np.interp(target_times, frame_times, rms)
        max_rms = energy_interp.max()
        energy_curve = (energy_interp / max_rms if max_rms > 0 else energy_interp).tolist()

        # --- Section boundaries via agglomerative MFCC clustering ---
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=12, hop_length=hop_length)
        # Pick k: roughly one section per 15 seconds, clamped to [2, 10]
        k = max(2, min(10, int(duration // 15)))
        boundary_frames = librosa.segment.agglomerative(mfcc, k=k)
        section_boundaries = librosa.frames_to_time(
            boundary_frames, sr=sr, hop_length=hop_length
        ).tolist()

        return {
            "bpm": bpm,
            "beat_timestamps": beat_timestamps,
            "energy_curve": energy_curve,
            "section_boundaries": section_boundaries,
            "duration_s": duration,
            "sample_rate": sr,
        }

    except Exception as exc:
        logger.error("Audio analysis failed: %s", exc, exc_info=True)
        raise RuntimeError(f"Audio analysis error: {exc}") from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
