from faster_whisper import WhisperModel
import os
import torch

class TranscriptionService:
    def __init__(self):
        # Switch to 'base.en' or 'small.en' for speed on CPU
        # 'distil-large-v3' is too heavy for CPU real-time
        model_size = "base.en" 
        
        # Check availability
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        
        print(f"Loading Whisper model: {model_size} on {device}...")
        
        try:
            self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
            print("Whisper model loaded successfully.")
        except Exception as e:
            print(f"Error loading model: {e}")
            # Fallback
            self.model = WhisperModel("tiny.en", device=device, compute_type=compute_type)

    def transcribe(self, audio_file_path):
        # beam_size=1 is greedy decoding, much faster
        segments, info = self.model.transcribe(
            audio_file_path, 
            beam_size=1, 
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        text = " ".join([segment.text for segment in segments])
        return text.strip()
