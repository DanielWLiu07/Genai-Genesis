"""Audio analysis pipeline: BPM, beats, per-instrument hit detection via HPSS + decay classification."""
import os
import tempfile
import logging

logger = logging.getLogger(__name__)


def analyze_audio(audio_bytes: bytes, filename: str) -> dict:
    """
    Analyse an audio file and return structured data for AMV sync.

    Returns:
        {
            bpm: float,
            beat_timestamps: list[float],      # ALL beat times in seconds
            beat_strengths: list[float],       # 0-1 strength per beat
            downbeat_timestamps: list[float],  # every 4th beat (bar starts)
            onset_times: list[float],          # all percussion/transient hits
            energy_peaks: list[float],         # timestamps of major energy spikes
            energy_curve: list[float],         # normalised 0-1, one value per 100ms
            section_boundaries: list[float],   # section change timestamps
            # Specific instrument hit timestamps:
            kick_times: list[float],           # kick / bass drum (20-250 Hz, percussive)
            snare_times: list[float],          # snare / clap (250-3000 Hz, percussive)
            hihat_times: list[float],          # closed hi-hat (3k+ Hz, fast decay <80ms)
            crash_times: list[float],          # crash / open-hihat (3k+ Hz, slow decay >200ms)
            horn_times: list[float],           # horn / brass / synth stabs (200-2500 Hz, harmonic, sustained)
            melodic_times: list[float],        # general melodic/harmonic transients
            duration_s: float,
            sample_rate: int,
        }
    """
    try:
        import librosa
        import numpy as np
    except ImportError as e:
        raise RuntimeError("librosa is required. Run: pip install librosa soundfile") from e

    suffix = os.path.splitext(filename)[1] or ".tmp"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        TARGET_SR = 22050
        MAX_DURATION_S = 180
        hop_length = 512

        y, sr = librosa.load(tmp_path, sr=TARGET_SR, mono=True, duration=MAX_DURATION_S)
        duration = float(librosa.get_duration(y=y, sr=sr))

        # ── BPM + beat timestamps ──────────────────────────────────────────────
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length, units='frames')
        bpm = float(np.atleast_1d(tempo)[0])
        beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length).tolist()

        # ── Beat strength ──────────────────────────────────────────────────────
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
        beat_env_values = onset_env[beat_frames] if len(beat_frames) > 0 else np.array([])
        if len(beat_env_values) > 0:
            max_env = beat_env_values.max()
            beat_strengths = (beat_env_values / max_env if max_env > 0 else beat_env_values).tolist()
        else:
            beat_strengths = []

        # ── Downbeats ─────────────────────────────────────────────────────────
        downbeat_times = [beat_times[i] for i in range(0, len(beat_times), 4)]

        # ── General onset detection ────────────────────────────────────────────
        onset_frames = librosa.onset.onset_detect(
            y=y, sr=sr, hop_length=hop_length,
            backtrack=True,
            pre_max=20, post_max=20, pre_avg=100, post_avg=100,
            delta=0.2, wait=10,
        )
        onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop_length).tolist()

        # ── Energy curve at 100ms resolution ──────────────────────────────────
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        frame_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
        target_times = np.arange(0.0, duration, 0.1)
        energy_interp = np.interp(target_times, frame_times, rms)
        max_rms = energy_interp.max()
        energy_curve = (energy_interp / max_rms if max_rms > 0 else energy_interp).tolist()

        # ── Energy peaks ───────────────────────────────────────────────────────
        from scipy.signal import find_peaks
        threshold = float(np.percentile(energy_interp, 75))
        peak_indices, _ = find_peaks(
            energy_interp,
            height=threshold,
            distance=int(0.5 / 0.1),
            prominence=threshold * 0.3,
        )
        energy_peaks = target_times[peak_indices].tolist()

        # ── Section boundaries via MFCC clustering ────────────────────────────
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=12, hop_length=hop_length)
        k = max(2, min(10, int(duration // 15)))
        boundary_frames = librosa.segment.agglomerative(mfcc, k=k)
        section_boundaries = librosa.frames_to_time(
            boundary_frames, sr=sr, hop_length=hop_length
        ).tolist()

        # ── HPSS: split into harmonic and percussive ──────────────────────────
        y_harmonic, y_percussive = librosa.effects.hpss(y, margin=3.0)

        # ── Helpers ────────────────────────────────────────────────────────────
        def _bandpass(signal, lo_hz, hi_hz):
            """Zero-phase FFT bandpass filter."""
            n = len(signal)
            freqs = np.fft.rfftfreq(n, d=1.0 / sr)
            spec = np.fft.rfft(signal)
            spec[~((freqs >= lo_hz) & (freqs <= hi_hz))] = 0
            return np.fft.irfft(spec, n=n)

        def _detect_onsets(signal, delta=0.15, wait=8, pre_max=15, post_max=15):
            frames = librosa.onset.onset_detect(
                y=signal, sr=sr, hop_length=hop_length,
                backtrack=True,
                pre_max=pre_max, post_max=post_max,
                pre_avg=80, post_avg=80,
                delta=delta, wait=wait,
            )
            return frames, librosa.frames_to_time(frames, sr=sr, hop_length=hop_length)

        def _frames_rms(signal):
            """Per-frame RMS energy of signal."""
            return librosa.feature.rms(y=signal, hop_length=hop_length)[0]

        def _decay_ms(onset_frame, band_rms, lookahead_frames=40):
            """
            Estimate how long (in ms) it takes for the RMS after an onset to
            drop to 20% of its peak.  Returns float ms.
            """
            if onset_frame >= len(band_rms):
                return 0.0
            window = band_rms[onset_frame: onset_frame + lookahead_frames]
            if len(window) == 0:
                return 0.0
            peak = window.max()
            if peak == 0:
                return 0.0
            threshold = peak * 0.2
            idx = np.argmax(window < threshold)
            if idx == 0 and window[0] >= threshold:
                idx = len(window)  # never fell below threshold in window
            return float(idx * hop_length / sr * 1000)

        # ── Kick (low-freq percussive) ─────────────────────────────────────────
        y_kick = _bandpass(y_percussive, 20, 250)
        kick_frames, kick_t = _detect_onsets(y_kick, delta=0.2, wait=10)
        kick_times = kick_t.tolist()

        # ── Snare (mid-freq percussive) ────────────────────────────────────────
        y_snare = _bandpass(y_percussive, 250, 3000)
        snare_frames, snare_t = _detect_onsets(y_snare, delta=0.15, wait=8)
        snare_times = snare_t.tolist()

        # ── Hi-hat vs Crash via high-freq + decay time ─────────────────────────
        # Both hi-hat (closed) and crash cymbals live in the high-freq band.
        # Distinguish them by how quickly the energy decays after each hit:
        #   Closed hi-hat : very fast decay  < 80 ms
        #   Open hi-hat   : medium decay      80-250 ms
        #   Crash / splash: slow decay       > 250 ms (energy rings out long)
        y_cymbal = _bandpass(y_percussive, 3000, sr // 2)
        cymbal_frames, cymbal_t = _detect_onsets(y_cymbal, delta=0.08, wait=4, pre_max=10, post_max=10)
        cymbal_rms = _frames_rms(y_cymbal)

        hihat_times: list[float] = []
        crash_times: list[float] = []
        for f, t in zip(cymbal_frames, cymbal_t):
            decay = _decay_ms(int(f), cymbal_rms)
            if decay < 80:
                hihat_times.append(float(t))
            else:
                # > 80ms = open hi-hat or crash — both go in crash_times so they
                # can be used for heavier effects
                crash_times.append(float(t))

        # ── Horn / Brass / Synth stabs (harmonic, mid-range, sustained) ────────
        # Strategy:
        #  1. Bandpass the harmonic component to 200-2500 Hz (horn / brass range)
        #  2. Find onsets in that band
        #  3. Keep only onsets where the note sustains ≥ 120 ms (i.e. NOT a
        #     short transient like a plucked string — horns hold their notes)
        y_horn_band = _bandpass(y_harmonic, 200, 2500)
        horn_frames, horn_t = _detect_onsets(y_horn_band, delta=0.12, wait=12, pre_max=20, post_max=20)
        horn_band_rms = _frames_rms(y_horn_band)

        horn_times: list[float] = []
        for f, t in zip(horn_frames, horn_t):
            decay = _decay_ms(int(f), horn_band_rms, lookahead_frames=60)
            # Only keep sustained sounds: decay > 120ms distinguishes horn stabs
            # from short plucks/clicks that bleed into this band
            if decay >= 120:
                horn_times.append(float(t))

        # ── General melodic onsets (full harmonic component) ───────────────────
        _, melodic_t = _detect_onsets(y_harmonic, delta=0.1, wait=10)
        melodic_times = melodic_t.tolist()

        return {
            "bpm": bpm,
            "beat_timestamps": beat_times,
            "beat_strengths": beat_strengths,
            "downbeat_timestamps": downbeat_times,
            "onset_times": onset_times,
            "energy_peaks": energy_peaks,
            "energy_curve": energy_curve,
            "section_boundaries": section_boundaries,
            "kick_times": kick_times,
            "snare_times": snare_times,
            "hihat_times": hihat_times,
            "crash_times": crash_times,
            "horn_times": horn_times,
            "melodic_times": melodic_times,
            "duration_s": duration,
            "sample_rate": sr,
        }

    except Exception as exc:
        logger.error("Audio analysis failed: %s", exc, exc_info=True)
        try:
            duration_s = _mutagen_duration(tmp_path)
            bpm_tag = _mutagen_bpm(tmp_path)
            return {
                "bpm": bpm_tag or 120.0,
                "beat_timestamps": [],
                "beat_strengths": [],
                "downbeat_timestamps": [],
                "onset_times": [],
                "energy_peaks": [],
                "energy_curve": [],
                "section_boundaries": [],
                "kick_times": [],
                "snare_times": [],
                "hihat_times": [],
                "crash_times": [],
                "horn_times": [],
                "melodic_times": [],
                "duration_s": duration_s,
                "sample_rate": 22050,
            }
        except Exception:
            pass
        raise RuntimeError(f"Audio analysis error: {exc}") from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _mutagen_duration(path: str) -> float:
    try:
        from mutagen import File as MutagenFile
        audio = MutagenFile(path)
        if audio and audio.info:
            return float(audio.info.length)
    except Exception:
        pass
    return 0.0


def _mutagen_bpm(path: str) -> float | None:
    try:
        from mutagen.id3 import ID3
        tags = ID3(path)
        bpm_tag = tags.get("TBPM")
        if bpm_tag:
            return float(str(bpm_tag))
    except Exception:
        pass
    return None
