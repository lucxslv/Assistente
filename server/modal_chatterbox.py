r"""
Serviço Serverless Chatterbox TTS no Modal (Resemble AI).
Permite síntese de voz neural de alta qualidade com suporte a português e clonagem de voz.

Deploy:
    cd C:/Users/lucas/OneDrive/Documentos/assistente
    modal deploy server/modal_chatterbox.py
"""

import modal

app = modal.App("chatterbox-tts")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .uv_pip_install(
        "chatterbox-tts==0.1.7",
        "fastapi[standard]>=0.115.0",
        "peft>=0.14.0",
        "soundfile>=0.12.1",
        "torchaudio>=2.5.0",
    )
)


@app.cls(
    gpu="t4",  # Econômica e rápida (coberta pelos $30/mês gratuitos do Modal)
    image=image,
    scaledown_window=60 * 5,  # Mantém aquecido por 5 minutos após a última requisição
)
class ChatterboxService:
    @modal.enter()
    def load(self):
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[Chatterbox] Carregando modelos no dispositivo: {device}")
        try:
            self.mtl_model = ChatterboxMultilingualTTS.from_pretrained(device=device)
        except Exception as e:
            print(f"[Chatterbox] Aviso ao carregar Multilingual: {e}")
            self.mtl_model = None

        try:
            self.turbo_model = ChatterboxTurboTTS.from_pretrained(device=device)
        except Exception as e:
            print(f"[Chatterbox] Aviso ao carregar Turbo: {e}")
            self.turbo_model = None

    @modal.fastapi_endpoint(docs=True, method="POST")
    def tts(self, item: dict = None, prompt: str = ""):
        from fastapi import HTTPException
        from fastapi.responses import Response

        payload = item or {}
        text = str(payload.get("text") or payload.get("prompt") or prompt or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Texto vazio para síntese.")

        language_id = str(payload.get("language_id", "pt"))
        model_type = str(payload.get("model_type", "multilingual"))
        exaggeration = float(payload.get("exaggeration", 0.5))

        audio_bytes = self.synthesize.local(
            text=text,
            language_id=language_id,
            model_type=model_type,
            exaggeration=exaggeration,
        )
        return Response(content=audio_bytes, media_type="audio/wav")

    @modal.fastapi_endpoint(docs=True, method="POST")
    def speech(self, item: dict = None, prompt: str = ""):
        return self.tts(item=item, prompt=prompt)

    @modal.method()
    def synthesize(
        self,
        text: str,
        language_id: str = "pt",
        model_type: str = "multilingual",
        exaggeration: float = 0.5,
    ) -> bytes:
        import io
        import torchaudio as ta

        # Prioriza o modelo multilíngue para português (pt)
        if model_type == "multilingual" and self.mtl_model is not None:
            wav = self.mtl_model.generate(text, language_id=language_id)
            sr = self.mtl_model.sr
        elif self.turbo_model is not None:
            wav = self.turbo_model.generate(text)
            sr = self.turbo_model.sr
        elif self.mtl_model is not None:
            wav = self.mtl_model.generate(text, language_id=language_id)
            sr = self.mtl_model.sr
        else:
            raise RuntimeError("Nenhum modelo Chatterbox disponível na GPU.")

        buffer = io.BytesIO()
        ta.save(buffer, wav, sr, format="wav")
        buffer.seek(0)
        return buffer.read()
