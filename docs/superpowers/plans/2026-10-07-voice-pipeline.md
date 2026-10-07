# Pipeline de Voz Charlie (ElevenLabs TTS, Groq STT e Wake Word) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reativar e modernizar o ecossistema de voz viva-voz do Charlie no Windows, integrando síntese de voz ElevenLabs com fallback para Edge-TTS, transcrição ultra-rápida via Groq Whisper, detecção contínua de palavra de ativação com OpenWakeWord (`hey_jarvis`), orquestrador `VoiceService` e controle pela interface Desktop.

**Architecture:** O `VoiceService` desacoplado roda em segundo plano gerenciando o ciclo de vida do microfone e da palavra de ativação `hey_jarvis`. Ao disparar, emite um *chime* sonoro, transcreve a fala do usuário via Groq Whisper (`whisper-large-v3`), processa a resposta no `AssistantPipeline` e sintetiza no alto-falante via ElevenLabs com streaming e fallback automático para Edge-TTS. O status é exposto via endpoints FastAPI em `api/routes/voice.py` e integrado à tela de Configurações do Desktop.

**Tech Stack:** Python 3.12, FastAPI, ElevenLabs REST API, Groq Cloud API, OpenWakeWord (ONNX), sounddevice, soundfile, Edge-TTS, React/Tauri.

**Spec:** `docs/superpowers/specs/2026-10-07-voice-pipeline-tts-stt-wakeword-design.md`

## Global Constraints
- Python 3.12 no Windows 10/11 x64.
- Não bloquear o event loop assíncrono do FastAPI durante captura de áudio ou detecção de Wake Word.
- Não quebrar o funcionamento do Charlie caso `ELEVENLABS_API_KEY` ou `GROQ_API_KEY` não estejam definidas — fallback gracioso obrigatório.
- Sem dependência de treinamento de redes neurais para a palavra de ativação (usar modelo embutido `hey_jarvis`).
- Higienização de texto para TTS: remover blocos markdown e URLs antes de falar.

## Review Focus
- **Input sem chave ElevenLabs ou cota excedida (HTTP 429):** Deve chavear instantaneamente para Edge-TTS sem lançar exceção não tratada nem silenciar o assistente.
- **Microfone ocupado ou sem permissão:** `VoiceService` e `WakeWordDetector` devem capturar o erro e transicionar para estado de erro amigável sem derrubar o backend FastAPI.
- **Ruído ambiente ou áudio vazio:** VAD deve descartar buffers sem fala sem fazer chamadas desnecessárias à API Groq.
- **Texto longo ou formatação técnica:** `clean_text_for_speech` deve converter código ou símbolos em descrições faladas naturais.
- **Interrupção de serviço (`stop()`):** O daemon deve liberar o dispositivo de áudio (`InputStream.close()`) imediatamente sem deixar threads órfãs.

---

### Task 1: Configuração e Dependências de Áudio

**Files:**
- Modify: `config.py:36-50`
- Modify: `.env.example`
- Test: `tests/test_audio_config.py`

**Interfaces:**
- Consumes: variáveis de ambiente do sistema.
- Produces: `config.elevenlabs_api_key`, `config.elevenlabs_voice_id`, `config.elevenlabs_model_id`, `config.groq_stt_model`, `config.wake_word`, `config.wake_word_enabled`.

- [ ] **Step 1: Write the failing test**
```python
def test_audio_config_fields():
    from config import config
    assert hasattr(config, "elevenlabs_api_key")
    assert hasattr(config, "elevenlabs_voice_id")
    assert hasattr(config, "elevenlabs_model_id")
    assert hasattr(config, "groq_stt_model")
```

- [ ] **Step 2: Run test to verify it fails**
Run: `.venv\Scripts\python.exe -m pytest tests/test_audio_config.py -v`
Expected: FAIL with missing attribute error.

- [ ] **Step 3: Implement fields in `config.py` and document in `.env.example`**
Adicionar campos na classe `Config` com valores padrão seguros (`eleven_multilingual_v2`, `whisper-large-v3`, etc.).

- [ ] **Step 4: Run test to verify it passes**
Run: `.venv\Scripts\python.exe -m pytest tests/test_audio_config.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add config.py .env.example tests/test_audio_config.py
git commit -m "feat(audio): add elevenlabs and groq audio config fields"
```

---

### Task 2: Text-to-Speech com ElevenLabs e Fallback Resiliente

**Files:**
- Modify: `audio/tts/tts.py`
- Test: `tests/test_tts.py`

**Interfaces:**
- Consumes: `config.tts_provider`, `config.elevenlabs_api_key`, `config.elevenlabs_voice_id`, `config.tts_voice`.
- Produces: `TextToSpeech.speak(text: str) -> None`, `TextToSpeech._synthesize_elevenlabs(text: str) -> Path | None`, `TextToSpeech._clean_text(text: str) -> str`.

- [ ] **Step 1: Write the failing test**
```python
import pytest
from audio.tts.tts import TextToSpeech

@pytest.mark.asyncio
async def test_clean_text_for_speech():
    tts = TextToSpeech()
    cleaned = tts._clean_text("Aqui está o código: ```python\nprint(1)\n``` e acesse https://site.com")
    assert "```" not in cleaned
    assert "https://" not in cleaned

@pytest.mark.asyncio
async def test_elevenlabs_fallback_to_edge(monkeypatch):
    tts = TextToSpeech()
    monkeypatch.setattr(tts, "_synthesize_elevenlabs", lambda text: None)
    # Deve executar o fallback para edge sem levantar exceção
    path = await tts._synthesize("Olá Charlie")
    assert path is not None
```

- [ ] **Step 2: Run test to verify it fails**
Run: `.venv\Scripts\python.exe -m pytest tests/test_tts.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement ElevenLabs synthesis and fallback logic in `audio/tts/tts.py`**
Implementar `_synthesize_elevenlabs` com requisição HTTP POST para `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` usando streaming em memória ou arquivo temporário WAV, captura de erro 401/429 e invocação de `_synthesize_edge` como fallback.

- [ ] **Step 4: Run test to verify it passes**
Run: `.venv\Scripts\python.exe -m pytest tests/test_tts.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add audio/tts/tts.py tests/test_tts.py
git commit -m "feat(tts): add elevenlabs integration with edge-tts fallback"
```

---

### Task 3: Speech-to-Text com Groq Whisper em Tempo Real

**Files:**
- Modify: `audio/stt/stt.py`
- Test: `tests/test_stt.py`

**Interfaces:**
- Consumes: `config.groq_api_key`, `config.groq_stt_model`, áudio gravado via `sounddevice`.
- Produces: `SpeechToText.transcribe() -> str | None`, `SpeechToText._transcribe_groq(audio: np.ndarray) -> str | None`.

- [ ] **Step 1: Write the failing test**
```python
import numpy as np
import pytest
from audio.stt.stt import SpeechToText

def test_transcribe_groq_empty_audio():
    stt = SpeechToText()
    result = stt._transcribe_groq(np.array([], dtype=np.float32))
    assert result is None
```

- [ ] **Step 2: Run test to verify it fails**
Run: `.venv\Scripts\python.exe -m pytest tests/test_stt.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement Groq transcription in `audio/stt/stt.py`**
Adicionar suporte ao cliente Groq (`groq.Groq(api_key=config.groq_api_key)`), convertendo o array de áudio para formato WAV em memória com `io.BytesIO` e enviando para `client.audio.transcriptions.create(model=config.groq_stt_model, file=("speech.wav", buffer.read()), language="pt")`.

- [ ] **Step 4: Run test to verify it passes**
Run: `.venv\Scripts\python.exe -m pytest tests/test_stt.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add audio/stt/stt.py tests/test_stt.py
git commit -m "feat(stt): implement in-memory groq whisper transcription"
```

---

### Task 4: Wake Word com OpenWakeWord `hey_jarvis` e Chime de Ativação

**Files:**
- Modify: `audio/wakeword/wakeword.py`
- Test: `tests/test_wakeword.py`

**Interfaces:**
- Consumes: `config.wake_word`, `config.wake_word_enabled`.
- Produces: `WakeWordDetector.wait_for_wake_word() -> bool`, `WakeWordDetector.play_activation_chime() -> None`.

- [ ] **Step 1: Write the failing test**
```python
import pytest
from audio.wakeword.wakeword import WakeWordDetector

def test_wakeword_initialization():
    detector = WakeWordDetector()
    assert detector is not None
    assert hasattr(detector, "play_activation_chime")
```

- [ ] **Step 2: Run test to verify it fails**
Run: `.venv\Scripts\python.exe -m pytest tests/test_wakeword.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement `play_activation_chime` and default `hey_jarvis` loading in `audio/wakeword/wakeword.py`**
Gerar uma onda senoidal suave (frequência 880Hz -> 1320Hz com envelope exponencial) reproduzida via `sounddevice` como sinalização de microfone aberto, e carregar o modelo nativo `hey_jarvis` do OpenWakeWord.

- [ ] **Step 4: Run test to verify it passes**
Run: `.venv\Scripts\python.exe -m pytest tests/test_wakeword.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add audio/wakeword/wakeword.py tests/test_wakeword.py
git commit -m "feat(wakeword): add hey_jarvis model and audio activation chime"
```

---

### Task 5: Orquestrador de Serviço de Voz (`VoiceService`)

**Files:**
- Create: `audio/service.py`
- Test: `tests/test_voice_service.py`

**Interfaces:**
- Consumes: `WakeWordDetector`, `SpeechToText`, `TextToSpeech`, `AssistantPipeline`.
- Produces: `VoiceService.start() -> None`, `VoiceService.stop() -> None`, `VoiceService.get_status() -> dict`, `VoiceState` enum (`IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `STOPPED`).

- [ ] **Step 1: Write the failing test**
```python
from audio.service import VoiceService, VoiceState

def test_voice_service_lifecycle():
    service = VoiceService()
    assert service.state == VoiceState.STOPPED
    status = service.get_status()
    assert status["running"] is False
```

- [ ] **Step 2: Run test to verify it fails**
Run: `.venv\Scripts\python.exe -m pytest tests/test_voice_service.py -v`
Expected: FAIL with ModuleNotFoundError.

- [ ] **Step 3: Implement `VoiceService` in `audio/service.py`**
Implementar gerenciador com thread em background segura, controle de estados, integração com o pipeline e ducking de áudio.

- [ ] **Step 4: Run test to verify it passes**
Run: `.venv\Scripts\python.exe -m pytest tests/test_voice_service.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add audio/service.py tests/test_voice_service.py
git commit -m "feat(voice): create decoupled VoiceService daemon"
```

---

### Task 6: Rotas da API FastAPI para Controle de Voz

**Files:**
- Create: `api/routes/voice.py`
- Modify: `api/main.py`
- Test: `tests/test_voice_api.py`

**Interfaces:**
- Consumes: instância singleton `voice_service`.
- Produces: endpoints `/api/voice/status`, `/api/voice/toggle`, `/api/voice/speak`, `/api/voice/test`.

- [ ] **Step 1: Write the failing test**
```python
from fastapi.testclient import TestClient
from api.main import app

def test_get_voice_status():
    client = TestClient(app)
    response = client.get("/api/voice/status")
    assert response.status_code == 200
    data = response.json()
    assert "running" in data
    assert "state" in data
```

- [ ] **Step 2: Run test to verify it fails**
Run: `.venv\Scripts\python.exe -m pytest tests/test_voice_api.py -v`
Expected: FAIL with 404 Not Found.

- [ ] **Step 3: Implement routes in `api/routes/voice.py` and register in `api/main.py`**
Criar `APIRouter(prefix="/voice", tags=["voice"])` com handlers para consulta de status, ativação/desativação e síntese de teste.

- [ ] **Step 4: Run test to verify it passes**
Run: `.venv\Scripts\python.exe -m pytest tests/test_voice_api.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add api/routes/voice.py api/main.py tests/test_voice_api.py
git commit -m "feat(api): add voice control endpoints"
```

---

### Task 7: Interface Desktop (Configurações de Voz & Teste)

**Files:**
- Modify: `desktop/src/components/SettingsModal.tsx`
- Modify: `desktop/src/services/api.ts`

**Interfaces:**
- Consumes: `/api/voice/status`, `/api/voice/toggle`, `/api/voice/test`.
- Produces: UI para ativar Wake Word ("Hey Jarvis"), selecionar provedor (ElevenLabs vs Edge), configurar ElevenLabs API Key / Voice ID e botão "Testar Voz".

- [ ] **Step 1: Update API client in `desktop/src/services/api.ts`**
Adicionar métodos `getVoiceStatus()`, `toggleVoice(enabled: boolean)`, `testVoice(text?: string)`.

- [ ] **Step 2: Update `SettingsModal.tsx` na aba "Voz & Fala"**
Adicionar switch de ativação contínua ("Hey Jarvis"), seletor de provedor TTS (ElevenLabs / Edge-TTS), inputs para chave e Voice ID, e botão "Testar Voz" com indicador de carregamento.

- [ ] **Step 3: Validate desktop build and types**
Run: `npm --prefix desktop run build` ou lint
Expected: Compilação limpa sem erros de TypeScript.

- [ ] **Step 4: Commit**
```bash
git add desktop/src/components/SettingsModal.tsx desktop/src/services/api.ts
git commit -m "feat(desktop): add voice settings UI with elevenlabs and wakeword controls"
```
