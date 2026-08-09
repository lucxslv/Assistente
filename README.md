# Voice AI Assistant

A modular, highly extensible Python-based personal voice assistant integrating language models, speech recognition, speech synthesis, and custom system tools.

Designed for robust local execution and experimentation, this project features an architecture that supports seamless switching between cloud-based and local LLM providers while safely controlling the local operating system.

---

## Architecture Overview

The system is designed with a 9-step sequential pipeline handling everything from environment perception to autonomous action execution and validation:

1. **Speech-to-Text (STT):** Local transcription powered by Faster-Whisper and CTranslate2 with VAD support.
2. **Wake Word Detection:** OpenWakeWord integration for continuous local listening.
3. **Intent Routing:** Heuristic and AI-driven classification to route commands vs. casual conversation.
4. **Context Management:** Maintains state variables and contextual awareness.
5. **Memory Retrieval:** Context-aware summarization of previous conversational turns.
6. **Prompt Generation:** Dynamic system prompts injected with current environment data.
7. **LLM Orchestration:** Agnostic provider support (OpenAI, Gemini, Groq, Ollama, OpenRouter).
8. **Validation & Execution:** Safe tool execution loop (app launcher, system control, etc.) with hallucination prevention for small local models.
9. **Text-to-Speech (TTS):** Edge TTS integration for natural neural voice output.

---

## Features

### Core Systems
- **Agnostic LLM Engine:** Run the assistant using heavy cloud models (GPT-4o, Llama-3-70b via Groq) or local lightweight models (Llama-3-8b via Ollama) with robust context management.
- **Autonomous Tool Execution:** The LLM can act upon the host system using predefined and registered Python tools.
- **Context Hardening:** Advanced history sanitization for local LLMs, preventing infinite tool loops and JSON hallucinations.

### Built-in Tools
- **App Launcher:** Open and close specific desktop applications dynamically.
- **System Control:** Manage system volume, screen lock, suspend, and shutdown.
- **Web Research:** Perform web searches and scrape full webpage content dynamically.
- **Environment Perception:** Access current date, time, weather, and system hardware metrics (CPU/RAM).

---

## Directory Structure

```text
.
├── config.py             # Global configurations and environment variables
├── main.py               # Application entry point
├── pyproject.toml        # Dependencies and project configurations
├── .env.example          # Environment variables template
│
├── core/
│   ├── engine.py         # Main assistant loop orchestration
│   ├── memory.py         # Conversation history and tool result management
│   └── pipeline.py       # 9-step processing pipeline
│
├── audio/
│   ├── stt/              # Speech-to-Text (faster-whisper)
│   ├── tts/              # Text-to-Speech (Edge TTS)
│   └── wakeword/         # Wake word detection
│
├── brain/
│   ├── profile.py        # Personality and behavior constraints
│   ├── router/           # Intent classification and routing
│   ├── planner/          # Action planning and response validation
│   └── prompts/          # System prompt builders
│
└── tools/
    ├── registry.py       # Tool registration and schema generation
    ├── app_launcher.py   # Application management tool
    ├── system_control.py # OS-level controls (Volume, Power)
    ├── web_search.py     # Search engine and web scraping integration
    └── [...]             # Modular tools (Home Assistant, Weather, etc.)
```

---

## Getting Started

### Requirements
- Python >= 3.12
- [uv](https://github.com/astral-sh/uv) (Package manager, highly recommended)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/lucxslv/Assistente.git
cd Assistente
```

2. Create the virtual environment and install dependencies:
```bash
uv sync
```

3. Setup environment configurations:
```bash
cp .env.example .env
```

4. Edit the `.env` file with your preferred API keys and LLM provider settings.

### Execution
Run the assistant directly using the virtual environment:
```bash
uv run python main.py
```

---

## Roadmap

- Fully integrated continuous Wake Word loop.
- Local GUI dashboard for system monitoring.
- Persistent SQLite-based conversational memory.
- Multi-agent orchestration for complex local tasks.
- Advanced keyboard/mouse automation modules.
