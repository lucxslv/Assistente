# Assistente de Voz com IA

Um assistente pessoal de voz modular desenvolvido em Python, com integração a modelos de inteligência artificial, reconhecimento de fala, síntese de voz e execução de ferramentas personalizadas.

O projeto foi criado com foco em aprendizado, experimentação e construção de uma arquitetura extensível, permitindo trocar facilmente o provedor de IA utilizado, desde APIs externas até modelos locais executados na própria máquina.

---

##  Funcionalidades

###  Reconhecimento de voz (Speech-to-Text)

* Transcrição utilizando **faster-whisper**.
* Processamento local através do CTranslate2.
* Detecção automática de início e fim da fala.
* Suporte a Voice Activity Detection (VAD).

###  Síntese de voz (Text-to-Speech)

* Conversão de texto em fala utilizando **Edge TTS**.
* Suporte a vozes neurais em Português do Brasil.

###  Múltiplos provedores de LLM

O assistente permite escolher diferentes modelos de linguagem:

* **OpenAI**

  * GPT-4o
  * GPT-4o-mini

* **Google Gemini**

  * Gemini Flash

* **Ollama**

  * Execução de modelos locais como Llama, Qwen e outros.

A troca do provedor pode ser feita através das configurações do ambiente.

###  Sistema de ferramentas

Arquitetura preparada para integração com funções externas:

* Controle de dispositivos via Home Assistant.
* Consulta de informações meteorológicas.
* Monitoramento do sistema.
* Execução de ações personalizadas.

###  Memória de conversa

* Histórico contextual durante a sessão.
* Estrutura preparada para futuras implementações de memória persistente.

---

##  Estrutura do Projeto

```text
.
├── config.py             # Configurações e variáveis de ambiente
├── main.py               # Entrada principal da aplicação
├── pyproject.toml        # Dependências e configuração do projeto
├── .env.example          # Exemplo de configuração
│
├── core/
│   ├── engine.py         # Orquestração do fluxo do assistente
│   └── memory.py         # Gerenciamento do histórico da conversa
│
├── perception/
│   ├── stt.py            # Reconhecimento de fala (faster-whisper)
│   ├── tts.py            # Síntese de voz (Edge TTS)
│   └── wakeword.py       # Detecção de palavra de ativação
│
├── llm/
│   ├── client.py         # Interface com provedores de LLM
│   └── prompts.py        # Prompts e instruções do modelo
│
└── tools/
    ├── registry.py       # Registro e execução de ferramentas
    ├── home_assistant.py # Integração com Home Assistant
    ├── system_info.py    # Informações do sistema
    └── weather.py        # Consulta meteorológica
```

---

##  Executando o projeto

### Requisitos

* Python `>=3.12`
* [uv](https://github.com/astral-sh/uv) (recomendado)

### Instalação

Clone o repositório:

```bash
git clone https://github.com/seu-usuario/seu-repositorio.git
cd assistente
```

Crie o ambiente e instale as dependências:

```bash
uv sync
```

Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas preferências e chaves de API.

Execute:

```bash
uv run python main.py
```

---

##  Configurações principais

Exemplo:

```env
# Provedor de IA
LLM_PROVIDER=ollama

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Voz
TTS_VOICE=pt-BR-FranciscaNeural
```

---

##  Objetivos futuros

* [ ] Sistema de memória persistente.
* [ ] Wake word totalmente integrado ao fluxo principal.
* [ ] Mais ferramentas para automação do computador.
* [ ] Interface gráfica.
* [ ] Execução distribuída em servidor local.
* [ ] Melhor gerenciamento de contexto e histórico.

---

##  Sobre o projeto

Este projeto é uma experiência de desenvolvimento de um assistente pessoal utilizando tecnologias modernas de inteligência artificial, com foco em aprendizado, arquitetura de software e integração entre diferentes sistemas.
