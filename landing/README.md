# Charlie Desktop — Landing Page Oficial

Landing Page oficial, moderna, responsiva e técnica do **Charlie Desktop** ("Seu Assistente Pessoal & Agent Workspace Operacional para Windows").

---

## 🚀 Como Visualizar e Testar

A página é **100% estática e autossuficiente**. Você pode abri-la diretamente em qualquer navegador moderno.

### Opção 1: Abrir diretamente no navegador padrão
Basta dar um duplo clique no arquivo `index.html` ou executar no terminal PowerShell:
```powershell
Start-Process "c:\Users\lucas\OneDrive\Documentos\assistente\landing\index.html"
```

### Opção 2: Servidor HTTP Local (Python)
Para simular um ambiente de produção completo com headers locais:
```powershell
cd c:\Users\lucas\OneDrive\Documentos\assistente\landing
python -m http.server 3000
```
Em seguida, abra no navegador: [http://localhost:3000](http://localhost:3000)

---

## 📁 Estrutura de Arquivos

```text
landing/
├── index.html            # Estrutura HTML5 semântica, responsiva e modular
├── styles.css            # Design tokens, tipografia técnica, grid ambient e mockups
├── main.js               # Interações, alternador de abas, simuladores e FAQ accordion
├── README.md             # Documentação do projeto
├── assets/
│   ├── charlie-logo.svg  # Vetor oficial da identidade visual do Charlie
│   └── charlie-logo.png  # Ícone em alta resolução
└── downloads/
    └── Charlie_1.0.0_x64-setup.exe  # Instalador oficial para Windows 10/11 x64 (2.75 MB)
```

---

## ✨ Seções & Recursos da Landing Page

1. **Hero Section Impactante**:
   - Apresentação: *"Seu Assistente Pessoal & Agent Workspace Operacional para Windows"*.
   - Badge oficial de lançamento v1.0.0 Stable para Windows 10 e 11 x64.
   - Chamadas diretas para ação (CTA): Download do instalador oficial e tour pelo workspace.
   - Indicadores de especificações técnicas: Tauri v2 + Rust Core, Zero-Trust Gatekeeper, Memória Local 100% privada e Gemini 2.0 Flash.

2. **Demonstração Interativa do Workspace (Mockup Fiel ao App)**:
   - Moldura de janela com barra de título estilizada do Windows e telemetria de hardware local.
   - **Alternador de Modos**: Alterne dinamicamente entre o **Modo Agente Autônomo** (com árvore de passos e aprovação atômica) e o **Modo Chat Conversacional** (com streaming e métricas de latência).
   - **Context Drawer Interativo**: Clique nas abas para inspecionar em tempo real:
     - 📁 **Hub de Ativos**: Lista de arquivos criados e subagentes ativos.
     - 🔀 **Git Diff Review**: Inspeção visual unificada com botões "Aceitar" e "Reverter".
     - 💻 **Terminais & Logs**: Terminal PowerShell ao vivo com códigos de retorno.
     - 📄 **Artefatos**: Visualização formatada de relatórios e documentação Markdown.

3. **Destaques Principais (Grid Técnico)**:
   - **Local Agent Runtime 2.0**: Execução nativa no Windows com zero latência (PowerShell, Win32).
   - **Context Drawer & Inspector**: Gestão unificada de ativos, diffs e terminais.
   - **Arquitetura Zero-Trust**: Permission Engine com aprovação atômica e proteção contra RCE.
   - **Dual-Mode Operacional**: Alternância fluida entre Chat e Modo Agente com Verifier de Evidências.
   - **Híbrido & Suporte Offline**: Google Gemini Flash + modelos locais via Ollama e Faster-Whisper.
   - **Charlie Spotlight Global**: Atalho global instantâneo (`Ctrl + Space`).

4. **Simulador Interativo do Permission Engine**:
   - Experimente na prática as decisões de segurança: *"Permitir Uma Vez"*, *"Permitir para Tarefa"* ou *"Bloquear Ação"*.
   - Ledger de auditoria gravado em tempo real com hash e timestamp.

5. **Console Interativo CLI**:
   - Teste comandos como `charlie doctor`, `charlie agent run` e `charlie status` diretamente no navegador.

6. **Janela Interativa do Spotlight**:
   - Pressione `Ctrl + Space` em qualquer ponto da página ou clique no botão Spotlight para testar a experiência do launcher flutuante.

7. **Seção de Download & Instalação**:
   - Download direto do instalador oficial `Charlie_1.0.0_x64-setup.exe`.
   - Checksum criptográfico SHA-256 verificado com botão de cópia de um clique:
     `0710DE74D9DBEC9ACEDB33E933FAFFB2081FD1A5BCB7D2AC541FAEA00D902426`
   - Requisitos de sistema (Windows 10/11 x64, 4GB RAM, WebView2).
   - Comando Winget para instalação rápida por linha de comando.

8. **FAQ Accordion**:
   - Perguntas e respostas técnicas sobre segurança, privacidade local, diferenças de modos e execução no Windows.

---

## 🎨 Design Tokens & Estética

- **Estilo**: *Clean Technical / Dark Titanium / Electric Violet*
- **Paleta de Cores**:
  - Background Canvas: `#0A0B0E` / `#0E0F12`
  - Superfícies Elevadas: `#15171C` / `#1B1E24`
  - Bordas Sutis: `#292D35` e `rgba(255, 255, 255, 0.08)`
  - Destaque Elétrico: `#8B7CFF` (Electric Violet) com brilho suave
  - Status Funcionais: Emerald (`#34D399`), Amber (`#FBBF24`), Rose (`#F87171`), Cyan (`#38BDF8`)
- **Tipografia**: `Inter` (UI limpa) e `JetBrains Mono` (termos técnicos, logs, comandos e diffs).
