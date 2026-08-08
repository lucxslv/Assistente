# Jarvis Virtual Assistant - Documentação do Projeto 🤖

Este documento detalha toda a arquitetura, tecnologias e funcionalidades implementadas no assistente de voz "Jarvis". O projeto evoluiu de um script simples para um orquestrador modular avançado capaz de ouvir continuamente, tomar ações em segundo plano e manter o contexto de conversas.

---

## 1. Visão Geral da Arquitetura (Pipeline de 9 Estágios)
O "Cérebro" do Jarvis foi modelado usando um Pipeline linear altamente organizado. A cada ciclo de interação, a requisição passa pelas seguintes etapas no `core/pipeline.py`:

1. **Escuta Contínua**: O microfone aguarda o Wake Word.
2. **Speech-to-Text (STT)**: Captação dinâmica do áudio e transcrição em texto.
3. **Analisador de Intenção (Router)**: Decide se a fala do usuário é um bate-papo, pesquisa ou um comando.
4. **Contexto**: Injeta informações de ambiente (data, hora, SO).
5. **Memória**: Busca informações de curto/médio prazo.
6. **Ferramentas (Tools)**: Prepara as funções disponíveis para a IA usar.
7. **Motor LLM**: A IA (Llama 3.2) pensa e decide a resposta ou invoca uma ação (Tool Calling).
8. **Validador**: Filtra erros ou formatações erradas da IA.
9. **Text-to-Speech (TTS)**: O assistente responde em voz alta.

---

## 2. Stack Tecnológica Utilizada

### Inteligência e Processamento
* **Modelo LLM**: **Llama 3.2** rodando localmente via **Ollama**.
* **STT (Speech-to-Text)**: **Whisper Large v3** rodando em altíssima velocidade na nuvem da **Groq**.
* **TTS (Text-to-Speech)**: API **Edge TTS** da Microsoft (Voz `pt-BR-AntonioNeural`), garantindo uma voz masculina profunda, natural e rápida.

### Áudio e Automação
* **Wake Word**: **OpenWakeWord** (Modelo `hey_jarvis_v0.1.onnx`), rodando offline para ativação por voz segura.
* **Reprodutor de Mídia**: **Python-VLC** em conjunto com **yt-dlp**, operando em modo "headless" (invisível/sem interface gráfica).
* **Tool Calling**: Sistema customizado dentro do arquivo `providers/ollama.py` para injetar e parsear os comandos nativos de ferramentas suportados pelo modelo.

---

## 3. Principais Desafios e Soluções (Features Implementadas)

### 3.1. STT Dinâmico & Anti-Alucinações
* **Desafio**: O microfone cortava as frases do usuário no meio ou o modelo Whisper inventava legendas bizarras ("Obrigado", "Inscreva-se").
* **Solução**: 
  * Aumentamos o tempo de silêncio exigido (VAD - Voice Activity Detection) para 2.5 segundos, permitindo que você faça pequenas pausas na fala.
  * O STT na Groq foi ajustado com `temperature=0.0`, prompts específicos para não traduzir o silêncio, e filtros de *Regex* implacáveis que limpam qualquer lixo de transcrição.

### 3.2. Amnésia do Wake Word
* **Desafio**: Ao terminar um comando e voltar a hibernar, a IA ativava sozinha repetindo o mesmo comando porque a memória interna da rede neural guardava o resíduo do "Hey Jarvis" falado no passado.
* **Solução**: Implementamos `self._model.reset()` no exato momento da detecção para apagar o buffer de áudio passado (amnésia forçada), garantindo zero acionamentos fantasmas.

### 3.3. Reprodutor de Música "Submarino" (VLC)
* **Desafio**: Abrir abas de navegador poluía a tela do PC e impossibilitava o controle sistemático do que estava tocando.
* **Solução**: Integramos o VLC oculto ao projeto. Ao pedir uma música, o `yt-dlp` coleta o link cru do YouTube e passa para o `MediaManager`. O assistente ganha 4 super-poderes programáticos (Tools):
  1. `play_music`
  2. `pause_music` (forçado com `.set_pause(1)` para não causar bugs de *toggle*)
  3. `resume_music`
  4. `set_volume` (com casting de tipos forçado para evitar conflitos de String vinda do LLM).

### 3.4. O Ducking (Atenuação Inteligente de Volume)
* **Desafio**: A música alta atrapalhava o usuário ao dar novos comandos e se misturava com a voz do próprio assistente.
* **Solução**: Uma funcionalidade engenhosa no motor principal `core/engine.py`. Assim que a mágica "Hey Jarvis" é disparada, um bloco `try/finally` força o volume para 20%. Ele se mantém assim enquanto capta o áudio, pensa e fala, devolvendo o volume para os 100% no exato instante em que ele se cala.

### 3.5. Correção de Memória de Ferramentas (LLM)
* **Desafio**: O Ollama frequentemente travava e respondia *"Desculpe, não consegui formular uma resposta"* após executar um comando.
* **Solução**: Adaptamos a classe de `ConversationMemory` e o `OllamaProvider` para manter no histórico o papel (`role: tool`) e a prova técnica de que a assistente emitiu uma Tool Call (mantendo o contexto lógico para o Llama 3.2 não se perder). Além disso, adicionamos um "Fast-Track" no pipeline: se a ferramenta for executada com sucesso, ele corta processamento de LLM extra e fala uma string de confirmação de Ação Concluída e dorme rápido.

---

## 4. Estrutura de Arquivos Principal (Pós-Refatoração)
* `main.py` - Ponto de ignição assíncrono.
* `config.py` e `.env` - Centralizador de variáveis de ambiente.
* `core/engine.py` - Onde a vida acontece: Loop de Wake Word, Gravação, Ducking e Processamento.
* `core/pipeline.py` - O funil de dados de 9 estágios.
* `tools/media_player.py` - A joia da coroa. Singleton que guarda e manipula o motor VLC em segundo plano.
* `audio/wakeword/wakeword.py` - Sentinela dorminhoca usando OpenWakeWord.
* `providers/ollama.py` - Ponte comunicadora customizada entre o pipeline em Python e a API Llama 3.2.

---
**Status Atual**: MVP v1.0 Funcional, Extremamente Rápido, Invisível e Escalável. 🚀
