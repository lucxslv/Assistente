# Plano de Implementação: Modernização da Interface Nativa Tauri (Widgets Ricos, Raciocínio e UI)

- **Data:** 09/10/2026
- **Módulo:** `desktop/` (Tauri 2.0 Rust + React 19 + TypeScript + Tailwind CSS)
- **Status:** Planejamento Aprovado / Em Execução
- **Objetivo:** Trazer paridade total com o backend e mobile no cliente Desktop Tauri, implementando o suporte a widgets estruturados, bloco de raciocínio expansível (`<thought>`), tratamento resiliente de erros com Error Boundary e refinamento visual de ponta a ponta do Chat.

---

## 1. Escopo de Mudanças

1. **Definição de Tipos (`desktop/src/types.ts`)**:
   - Adicionar interface `WidgetPayload` (alinhada com o contrato canônico do backend `core/widgets.py`).
   - Adicionar campos opcionais `widget?: WidgetPayload` e `thought?: string` na interface `Message`.
   - Suportar tipos de eventos de stream `"widget"` e `"thought"` em `StreamEvent`.

2. **Serviço de Comunicação (`desktop/src/services/api.ts`)**:
   - No loop do leitor SSE de `sendChatMessageStream`, processar linhas `event: widget` e `event: thought`.
   - Tratar payloads estruturados no evento `event: done`.

3. **Componentes de Widgets Nativos (`desktop/src/components/widgets/WidgetRegistry.tsx`)**:
   - Criar `WidgetErrorBoundary` para isolamento de erros sem quebrar o chat.
   - Criar `ServerHealthWidget` (CPU, Memória, Status de Conexão e DB com estilo dark premium).
   - Criar `StorageUsageWidget` (Uso de disco com barras e status visual).
   - Criar `UnavailableWidget` (Fallback com motivo claro e mensagem amigável).
   - Criar `WidgetRegistry` roteador unificado.

4. **Componente de Pensamento / Raciocínio (`desktop/src/components/ThinkingBlock.tsx`)**:
   - Accordion colapsável com ícone de lâmpada/cérebro, badge de raciocínio e transição suave.
   - Indicador de digitação/pensamento em tempo real durante streaming.

5. **Refinamento do Chat (`desktop/src/components/ChatArea.tsx` e `desktop/src/App.tsx`)**:
   - Integrar `ThinkingBlock` e `WidgetRegistry` nas mensagens do assistente.
   - Refinar os balões de mensagem, tipografia de código e barra de ações.
   - Conectar o manipulador de eventos SSE em `App.tsx` para atualizar `thought` e `widget`.

6. **Verificação e Entrega**:
   - Executar `npm --prefix desktop run build` para garantir 0 erros de tipagem e bundling do Vite.
   - Validar testes globais do ecossistema.

---

## 2. Ordem de Execução

- [x] **Etapa 1:** Atualizar interfaces em `desktop/src/types.ts`.
- [x] **Etapa 2:** Implementar suporte a SSE para `widget` e `thought` em `desktop/src/services/api.ts` e `desktop/src/App.tsx`.
- [x] **Etapa 3:** Criar `desktop/src/components/widgets/WidgetRegistry.tsx` com `WidgetErrorBoundary`.
- [x] **Etapa 4:** Criar `desktop/src/components/ThinkingBlock.tsx`.
- [x] **Etapa 5:** Atualizar `desktop/src/components/ChatArea.tsx` e `desktop/src/App.tsx`.
- [x] **Etapa 6:** Validar com `npm --prefix desktop run build` e commitar em etapas rastreáveis.
