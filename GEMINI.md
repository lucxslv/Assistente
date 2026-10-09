# Regras de Agente e Contexto do Projeto — Charlie AI

Este arquivo define as diretrizes obrigatórias de contexto, arquitetura e operação para qualquer agente de IA trabalhando no repositório **Charlie AI**.

---

## 1. Visão Geral do Projeto
O **Charlie** é um ecossistema de assistência pessoal e inteligência autônoma com:
- **Desktop Nativo (`desktop/`):** Tauri 2.0 (Rust) + React 19 + TypeScript + Tailwind CSS.
- **Web Chat (`web-chat/`):** React 19 + Vite (Mobile-First / PWA).
- **Backend & Cloud Brain (`api/`, `core/`, `brain/`, `memory/`, `audio/`, `providers/`, `tools/`):** FastAPI em Python 3.12+, memória vetorial (Supabase/PostgreSQL) e pipeline de áudio local (Groq Whisper, ElevenLabs, OpenWakeWord).
- **Gerenciador de Dependências:** `uv` e ambiente virtual `.venv/`.

---

## 2. Protocolo Obrigatório de Absorção de Contexto (Passo 0)
Antes de propor ou implementar qualquer alteração, o agente deve seguir este checklist mental:

1. **Mapeamento de Pastas:** Consulte [`docs/architecture/MODULOS.md`](file:///C:/Users/lucas/OneDrive/Documentos/assistente/docs/architecture/MODULOS.md) para garantir que arquivos novos sejam criados nas pastas corretas e de acordo com as convenções do ecossistema.
2. **Histórico Recente de Features:** Verifique a pasta [`docs/superpowers/plans/`](file:///C:/Users/lucas/OneDrive/Documentos/assistente/docs/superpowers/plans) para entender as implementações mais recentes (ex.: Pipeline de Voz com STT, TTS e Wake-word) e evitar regressões.
3. **Lições Aprendidas:** Consulte [`agent_experience_lessons.json`](file:///C:/Users/lucas/OneDrive/Documentos/assistente/agent_experience_lessons.json) antes de executar automações ou sugerir comandos.

---

## 3. Regras Operacionais de Ambiente (Windows & PowerShell)
O ambiente de execução é **Windows** com **PowerShell**.

- ❌ **Proibido usar comandos Unix/Bash:**
  - NÃO use `touch` ➔ Use a ferramenta `write_to_file` ou `New-Item -ItemType File -Force`.
  - NÃO use `grep` ➔ Use `Select-String -Pattern <termo>`.
  - NÃO use `rm -rf` ➔ Use `Remove-Item -Recurse -Force`.
  - NÃO use `ls -la` ➔ Use `Get-ChildItem -Force`.
  - NÃO use `export VAR=val` ➔ Use `$env:VAR="val"`.
- 🐍 **Execução de Python:**
  - Execute scripts sempre com `.venv\Scripts\python.exe` ou `uv run python <script>`.
  - Nunca execute `pip install` global. Para adicionar dependências use `uv add <pacote>`.
- 🔤 **Codificação de Arquivos:**
  - Todo arquivo deve ser lido e gravado estritamente em **UTF-8** para evitar quebras de acentuação no Windows.

---

## 4. Comandos e Scripts Rápidos
- **Iniciar Desktop:** `run_desktop.bat` (inicia a API backend e o frontend Tauri).
- **Iniciar Mobile:** `run_mobile.bat` (Metro Bundler / Expo Go + API).
- **Deploy Web:** `deploy-web.bat` / `deploy-web.ps1` (Vercel).
- **Rodar Testes:** `.venv\Scripts\pytest tests/` ou `uv run pytest tests/`.
- **Verificar Tipos Desktop:** `npm --prefix desktop run build`

---

## 5. Padrões de Código e Qualidade
- **Backend:** Código Python modular, funções assíncronas quando lidarem com I/O, tipagem com Pydantic v2 e validação em `config.py`.
- **Test-Driven:** Sempre valide alterações criando ou executando testes com `pytest` antes de finalizar a tarefa.
