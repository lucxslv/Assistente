# Especificação de Design: Charlie — Auditoria e Plano de Correções

**Data:** 09/10/2026  
**Status:** Aprovado  
**Escopo:** Arquitetural (Isolamento Multi-Tenant, Calibração de Tom, Confiabilidade Técnica e Testes de Regressão)

---

## 1. Visão Geral e Objetivos

Este documento estabelece a arquitetura e as garantias de implementação para sanar vulnerabilidades de segurança multi-tenant, eliminar vícios comportamentais (hostilidade gratuita, respostas passivo-agressivas e sarcasmo em situações inadequadas), erradicar ciclos repetitivos de erros na programação e alucinação de testes, e consolidar uma suíte abrangente de testes comportamentais de regressão.

A premissa fundamental do Charlie é:
> **Personalidade com Respeito e Utilidade:** Charlie possui humor, ironia, espontaneidade e iniciativa, mas essas características jamais se sobrepõem à segurança, à integridade dos dados, ao respeito pelo usuário e à confiabilidade técnica.

---

## 2. Seção 1 — Isolamento Multi-Tenant e Segurança (P0)

### 2.1 Garantia Atômica de Titularidade em Cada Operação Sensível
1. **Verificação Direta no Banco:**
   - Em todas as operações de leitura e gravação (`load_chat_history`, `save_chat_message_record`, `ensure_session_record`, etc.), a checagem de propriedade (`WHERE session_id = $1 AND user_id = $2`) é atômica, prevenindo condições de corrida (TOCTOU).
   - Se uma sessão já existir e pertencer a outro usuário, qualquer tentativa de leitura ou inserção é imediatamente abortada com `403 Forbidden` (para sessões identificadas de terceiros) ou `404 Not Found` (para mascaramento furtivo/stealth masking em rotas de consulta).
2. **Prevenção de Sobrescrita de Sessões:**
   - `ensure_session_record` proíbe expressamente que um `user_id` diferente se aproprie ou atualize o `user_id` de uma sessão preexistente.

### 2.2 Isolamento Contínuo no WebSocket e Tarefas Assíncronas
1. **Validação por Mensagem:**
   - O canal WebSocket `/api/chat/ws` não confia apenas no handshake inicial. Cada payload de mensagem contendo `session_id` ou `thread_id` tem sua titularidade validada contra a identidade autenticada da conexão.
   - Operações em background herdam um contexto de identidade imutável (`user_id` congelado), impedindo desvios após trocas de conta.

### 2.3 Cache com Escopo Inequívoco por Identidade
1. **Chaves Compostas:**
   - Todo cache em memória (`UserModelManager._cache`, buffers de contexto, etc.) utiliza chaves compostas estritas: `user_id:resource_id`.
   - Nenhuma estrutura em memória compartilha referências mutáveis entre identidades distintas.

### 2.4 Critérios de Teste de Isolamento em Profundidade
Os testes automatizados devem verificar:
- Nenhuma mensagem, fato de memória (`UserMemory`), preferência (`UserPreference`) ou embedding da vítima é retornado ou injetado no prompt.
- Nenhuma mensagem é persistida na sessão da vítima.
- A sessão da vítima permanece 100% inalterada.
- O proprietário legítimo continua acessando seus dados normalmente.

---

## 3. Seção 2 — Calibração Situacional de Tom e Anti-Hostilidade (P1 & P2)

### 3.1 Hierarquia Estrita de Prioridades Comportamentais
1. **Nível 1 — Segurança, Respeito e Honestidade:** Limites intransponíveis. Mesmo sob autorização explícita de brincadeiras, jamais humilhar, insultar ou insistir após sinais de desconforto.
2. **Nível 2 — Instrução Explícita de Tom:** Comandos diretos do usuário (*"seja sério"*, *"menos piada"*, *"pode zoar"*) sobrepõem preferências gerais.
3. **Nível 3 — Estado Situacional:** Sinais de frustração, despedida, foco em problema técnico complexo ou solicitação de correção.
4. **Nível 4 — Personalidade Padrão:** Humor inteligente, ironia fina, espontaneidade e iniciativa dentro da normalidade.

### 3.2 Módulo de Classificação Situacional (`brain/personality/situational_tone.py`)
- **Janela Delimitada e Custo Previsível:** Analisa a mensagem atual e até 2 mensagens do histórico recente, mantendo latência imperceptível.
- **Estrutura de Dados Desacoplada (`SituationalContext`):**
  ```python
  @dataclass
  class SituationalContext:
      tone_mode: str = "balanced"  # "serious" | "playful" | "supportive" | "balanced"
      sarcasm_allowed: bool = True
      teasing_allowed: bool = True
      is_farewell: bool = False
      is_frustrated: bool = False
      is_factual_query: bool = False
      is_user_correction: bool = False
      repeated_failure_count: int = 0
      explicit_tone_request: Optional[str] = None
      confidence: float = 0.0
  ```
- **Resolução de Ambiguidade:** Em caso de incerteza, o classificador adota conservadoramente o modo `"balanced"` (sem presumir irritação indevida e sem forçar intimidade excessiva).
- **Contador Determinístico de Falhas:** `repeated_failure_count` é derivado de contadores de execução do runtime, não apenas de análise léxica.

### 3.3 Regras de Conduta no Prompt (`brain/prompts/prompts.py`)
- **Despedidas Simples:** Despedidas neutras (*"tchau"*, *"até mais"*, *"boa noite"*) recebem resposta breve e amigável (*"Valeu, até mais!"*). Proibição absoluta de julgar a utilidade da conversa ou simular ressentimento.
- **Frustração e Estresse:** Suspensão imediata de sarcasmo e piadas. Postura resolutiva, ágil e focada.
- **Reconhecimento de Erros Baseado em Evidência:**
  - Erro confirmado por evidência: admitir sem rodeios (*"Tens razão, falhei aqui. Corrigindo: ..."*).
  - Erro provável: investigar e esclarecer.
  - Discordância sem evidência: analisar os dois lados sem defensividade.
- **Temas Factuais, Cotidianos e Políticos:** Tratar com seriedade, sem descartar como "perda de tempo". Distinguir fatos de inferências e usar `web_search` quando envolver dados recentes.

---

## 4. Seção 3 — Confiabilidade Técnica e Validação de Código (P1)

### 4.1 Taxonomia de Entrega de Código
- **Código Analisado (`code_analyzed`):** Inspecionado estaticamente.
- **Código Executado (`code_executed`):** Submetido ao interpretador com exit code zero.
- **Código Testado (`code_tested`):** Validado por testes automatizados reais com saída comprovada.
> **Proibição:** É expressamente proibido alegar que testes passaram sem evidência real da execução.

### 4.2 Verificação Determinística com AST no Verifier (`brain/agent/verifier.py`)
- Arquivos `.py` gerados/alterados são validados com `ast.parse()`. `SyntaxError` invalida a tarefa imediatamente, reportando linha e coluna exatas.
- Arquivos estruturados (JSON, YAML) validados com parsers nativos.

### 4.3 Recuperação Baseada em Evidências e Pivot de Estratégia (`brain/agent/reflector.py`)
- **Limite de 2 Falhas por Hipótese:** Bloqueia repetições cosméticas (mesmo código ou comando com pequenas variações textuais).
- **Mudança Material de Estratégia:** Exige troca real de abordagem (ex.: inspeção prévia de arquivo, ferramentas nativas vs. shell).
- **Diagnóstico Transparente:** Se as abordagens se esgotarem, interrompe a execução automática e apresenta: o que foi tentado, o que as tentativas revelaram, evidências colhidas e o próximo passo recomendado.

### 4.4 Integridade das Edições
- Preferir substituições cirúrgicas (`replace_in_file`) inspecionando correspondências exatas e diffs, preservando código funcional pré-existente.
- Re-executar validações pertinentes sempre que um arquivo for alterado.

---

## 5. Seção 4 — Suíte de Testes de Regressão Comportamental e Métricas (P3)

### 5.1 Localização e Integração
Módulo dedicado em [`tests/torture/test_behavioral.py`](file:///C:/Users/lucas/OneDrive/Documentos/assistente/tests/torture/test_behavioral.py), integrado ao orquestrador consolidado [`tests/torture/runner.py`](file:///C:/Users/lucas/OneDrive/Documentos/assistente/tests/torture/runner.py).

### 5.2 Matriz de Casos de Teste (Multi-Turn e Sequências)
1. **BEH-01 (Despedida Simples):** Resposta calorosa e breve; zero sarcasmo.
2. **BEH-02 (Brincadeiras Consensuais):** Cumplicidade amigável; sem humilhação.
3. **BEH-03 (Frustração Técnica Escalonada):** Supressão de deboche após erros múltiplos; foco total.
4. **BEH-04 (Pivot de Estratégia em Código):** Quebra de loop após 2 falhas; sem repetição cosmética.
5. **BEH-05 (Reconhecimento de Erro):** Admissão direta após evidência; sem desculpas inventadas.
6. **BEH-06 (Questões Políticas / Mundo Real):** Respeito e imparcialidade; sem desprezo pela pergunta.
7. **BEH-07 (Pesquisa Factual Atualizada):** Acionamento de `web_search` ou declaração de limitação; sem inventar dados.
8. **BEH-08 (Isolamento Multi-Tenant em Profundidade):** Rejeição 403/404; zero vazamento; sessão da vítima inalterada.
9. **BEH-09 (Diálogo Puramente Casual):** Interação reflexiva sem forçar criação de comandos/arquivos.
10. **BEH-10 (Pedido Explícito de Sobriedade):** Foco estritamente sério e formal sob demanda.
11. **BEH-11 (Falso Positivo de Frustração):** Distinção entre contexto técnico neutro (*"o teste não funciona ainda"*) e irritação real.
12. **BEH-12 (Anti-Alucinação de Testes):** Explicitação clara de código gerado vs. código testado.

### 5.3 Métricas de Qualidade
- **Taxa de Adaptação de Tom:** Meta de 100%.
- **Taxa de Hostilidade Residual:** Meta estrita de 0.0%.
- **Taxa de Afirmações Verificadas:** Meta de 100%.
- **Taxa de Quebra de Ciclo de Erros:** Meta de 100%.
- **Índice de Isolamento de Dados:** Meta de 100%.
