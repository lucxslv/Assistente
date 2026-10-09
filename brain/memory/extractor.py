"""Memory Extractor & Behavioral Learner — Aprendizado Contínuo e Extração Pós-Interação.

Executa assincronamente em segundo plano após a emissão da resposta ao usuário:
1. Extrai memórias semânticas (fatos, preferências explícitas e estilos de aprendizagem).
2. Extrai memórias episódicas (marcos, acontecimentos de projetos e decisões).
3. Detecta reações do usuário e atualiza os traços do User Model via EMA (0.9 * antigo + 0.1 * novo).
4. Atualiza a Working Memory da conversa (tópico, tarefa, entidades).
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
import google.generativeai as genai
from brain.memory.working_memory import working_memory_store
from brain.personality.user_model import user_model_manager
from config import config
from memory.database import db

logger = logging.getLogger("charlie.brain.extractor")

EXTRACTION_SYSTEM_PROMPT = """Você é o Extrator de Memória e Analista Comportamental de Alta Precisão do assistente Charlie.
Sua função é analisar o último turno da conversa (mensagem do usuário e resposta do Charlie) e produzir um JSON com:
1. Memórias duradouras ESTRUTURAIS E DE ALTO VALOR (se houver alguma).
2. Ajustes graduais no modelo de comunicação do usuário (User Model).
3. Estado atualizado da Working Memory da conversa ativa.

# REGRA DE OURO DA MEMÓRIA DE LONGO PRAZO (CRÍTICO):
A memória permanente (UserMemory) NÃO é um log de conversas e NÃO é um diário de atividades diárias.
O assistente JÁ armazena o histórico completo de mensagens de todos os chats no banco de dados. Portanto, a memória permanente serve EXCLUSIVAMENTE para fatos centrais que afetam o futuro a longo prazo do usuário.
Na imensa maioria das interações normais (85%+ das conversas), NÃO há nenhuma memória duradoura a ser salva. Se for esse o caso, retorne SEM HESITAR: "memories": [].

# O QUE NUNCA MEMORIZAR (DESCARTA IMEDIATAMENTE):
1. Acontecimentos cotidianos, temporais, efêmeros ou rotineiros:
   - "treinou no sábado", "foi para a academia hoje", "almoçou pizza", "está com sono", "acordou tarde", "choveu na cidade".
2. Tarefas, intenções e vontades momentâneas da sessão atual:
   - "está animado para mexer no chat web hoje", "vai trabalhar no assistente agora", "está depurando o erro X", "vai testar uma função".
3. Fofocas ou menções soltas de terceiros sem impacto estrutural:
   - "amigo Rian joga no tigrinho", "conhecido mandou um abraço", "fulano fez uma piada", "o amigo Thiago fez uma saudação".
4. Metalinguagem e postura efêmera da conversa:
   - "usuário usou a gíria cria", "usuário foi simpático", "usuário riu", "usuário foi descontraído". (Isso pertence ao User Model Feedback, NUNCA às memórias de fatos!).
5. Dúvidas pontuais, perguntas de curiosidade ou explicações gerais:
   - "o usuário perguntou como funciona uma esteira", "o usuário quis saber sobre Docker".

# O QUE MEMORIZAR (APENAS ALTA RELEVÂNCIA ESTRUTURAL, importance >= 0.75):
1. Identidade e Perfil Permanente:
   - Nome real ("O nome do usuário é Lucas"), profissão, cidade/localização, academia/time oficial ("Treina Jiu-Jitsu na equipe GFTeam").
2. Projetos Contínuos Estruturais:
   - Projetos de longo prazo e suas tecnologias-chave ("Criador e arquiteto do projeto Charlie", "Desenvolve o projeto escolar MetalSense com ESP32").
3. Preferências Técnicas e Regras Declaradas:
   - Regras explícitas e definitivas ("Odeia respostas prolixas", "Prefere código Python sem type hints", "Utiliza Windows 11 como sistema operacional de desenvolvimento").
4. Restrições Pessoais/Éticas Inegociáveis:
   - "Não consome bebidas alcoólicas", "Possui intolerância alimentar a glúten", "Recusa pedidos de ferramentas maliciosas".

# ATRIBUTOS DA MEMÓRIA:
- content: Descrição clara, atômica e independente em 3ª pessoa ("O usuário se chama...", "O usuário prefere...").
- type: "semantic_preference", "semantic_fact", "semantic_learning", "episodic_event"
- confidence: 0.75 a 1.0 (apenas alta certeza)
- importance: 0.75 a 1.0 (apenas relevância contínua futura real)
- action: "reinforce" | "supersede"

# FEEDBACK COMPORTAMENTAL (USER MODEL)
Analise se o usuário deu pistas sobre como prefere que o Charlie se comunique:
- Reclamou de respostas longas ("resume", "fala menos") -> verbosity: 0.25, directness: 0.95
- Pediu detalhes técnicos ou código aprofundado -> technical_depth: 0.90
- Reagiu rindo a uma provocação/piada -> likes_teasing: true, humor: 0.85
- Reclamou de brincadeiras ("fala sério") -> likes_teasing: false, humor: 0.20
- Foi muito informal ou usou gírias -> formality: 0.10

Retorne ESTRITAMENTE um JSON no seguinte formato (sem blocos de markdown adicionais):
{
  "memories": [
    {
      "content": "Descrição clara e independente da memória",
      "type": "semantic_preference | semantic_fact | semantic_learning | episodic_event",
      "confidence": 0.85,
      "importance": 0.80,
      "action": "reinforce | supersede"
    }
  ],
  "user_model_feedback": {
    "directness": null,
    "verbosity": null,
    "technical_depth": null,
    "formality": null,
    "humor": null,
    "likes_teasing": null
  },
  "working_memory_update": {
    "topic": "Tópico principal discutido",
    "task": "Tarefa atual se houver",
    "entities": ["Entidade1", "Entidade2"]
  }
}
"""


class MemoryExtractor:
    """Extrai informações e aprende com interações sem bloquear o usuário."""

    def __init__(self):
        if config.gemini_api_key:
            genai.configure(api_key=config.gemini_api_key)
        self.model_name = getattr(config, "gemini_model", "gemini-3.1-flash-lite")

    async def analyze_turn_async(
        self,
        user_text: str,
        assistant_reply: str,
        user_id: str = "default",
        thread_id: Optional[str] = None,
    ) -> None:
        """Executa a análise em segundo plano de forma desacoplada."""
        # Se for uma mensagem muito curta ou irrelevante (ex: "ok", "valeu"), pula extração pesada
        clean_text = user_text.strip().lower()
        if len(clean_text) < 6 or clean_text in ["ok", "beleza", "sim", "não", "valeu", "show", "obrigado", "tmj"]:
            return

        try:
            prompt = f"""TURNO DE CONVERSA:
USUÁRIO: {user_text}
CHARLIE: {assistant_reply[:500]}
"""
            models_to_try = [self.model_name, "gemini-3.1-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"]
            res = None
            loop = asyncio.get_event_loop()

            for m_name in models_to_try:
                try:
                    model = genai.GenerativeModel(
                        model_name=m_name,
                        generation_config={"response_mime_type": "application/json", "temperature": 0.1},
                        system_instruction=EXTRACTION_SYSTEM_PROMPT,
                    )
                    res = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
                    if res and res.text:
                        break
                except Exception as m_err:
                    logger.debug(f"[MemoryExtractor] Fallback do modelo {m_name}: {m_err}")
                    continue

            if not res or not res.text:
                return

            raw_json = res.text.strip()
            data = json.loads(raw_json)

            # 1. Processa memórias candidatas com rigoroso filtro de importância e ruído efêmero
            memories = data.get("memories", [])
            ephemeral_blacklist = [
                "treinou no", "treinou na", "treinou ontem", "treinou hoje", "treinou fisicamente",
                "almoçou", "vai almoçar", "dormiu", "acordou", "com sono",
                "no sábado", "no domingo", "na segunda", "na terça", "na quarta", "na quinta", "na sexta",
                "ontem", "hoje", "nesta manhã", "nesta tarde", "nesta noite",
                "usou a gíria", "linguagem informal", "atitude descontraída",
                "está animado para", "está querendo trabalhar", "vamos trabalhar em você",
                "demonstrou interesse em focar no desenvolvimento", "focado em realizar melhorias no chat",
            ]

            saved_count = 0
            for m in memories:
                content = m.get("content", "").strip()
                if not content or len(content) < 8:
                    continue
                m_type = m.get("type", "semantic_fact")
                conf = float(m.get("confidence", 0.8))
                imp = float(m.get("importance", 0.5))

                # Filtro 1: Somente fatos com relevância e confiança altas
                if imp < 0.75 or conf < 0.75:
                    logger.debug(f"[MemoryExtractor] Descartando memória com baixa relevância ({imp}) ou confiança ({conf}): '{content}'")
                    continue

                # Filtro 2: Descarte de ruídos cotidianos e tarefas da sessão atual
                content_lower = content.lower()
                if any(bad_phrase in content_lower for bad_phrase in ephemeral_blacklist):
                    logger.info(f"[MemoryExtractor] Memória efêmera/cotidiana descartada por filtro de qualidade: '{content}'")
                    continue

                # Filtro 3: Proteção de integridade de identidade canônica
                from brain.personality.canonical_identity import sanitize_memory_candidate
                allowed, clean_cand, reason = sanitize_memory_candidate(content, m_type, user_id=user_id)
                if not allowed:
                    logger.warning(f"[MemoryExtractor] Memória descartada por proteção de identidade canônica ({reason}): '{content}'")
                    continue
                content = clean_cand

                action = m.get("action", "reinforce")

                saved_via_pool = False
                try:
                    from api.db import get_or_init_db_pool
                    from api.services.chat_persistence import save_user_memory_entry
                    pool = await get_or_init_db_pool()
                    if pool:
                        res_id = await save_user_memory_entry(
                            pool,
                            user_id=user_id,
                            fact=content,
                            category=m_type,
                            importance=imp,
                            confidence=conf,
                        )
                        saved_via_pool = bool(res_id)
                except Exception as p_err:
                    logger.debug(f"Erro pool MemoryExtractor: {p_err}")

                if not saved_via_pool:
                    db.add_or_reinforce_memory(
                        content=content,
                        memory_type=m_type,
                        importance=imp,
                        confidence=conf,
                        user_id=user_id,
                        action=action,
                    )
                saved_count += 1

            # 2. Atualiza User Model (Aprendizado Comportamental Gradual via EMA)
            feedback = data.get("user_model_feedback", {})
            user_model = user_model_manager.get_user_model(user_id=user_id)
            updated_any_trait = False

            for trait in ["directness", "verbosity", "technical_depth", "formality", "humor"]:
                score = feedback.get(trait)
                if score is not None and isinstance(score, (int, float)):
                    user_model.update_trait(trait, float(score), alpha=0.1)
                    updated_any_trait = True

            likes_teasing = feedback.get("likes_teasing")
            if likes_teasing is not None and isinstance(likes_teasing, bool):
                user_model.set_interaction_preference("likes_teasing", likes_teasing)
                updated_any_trait = True

            if updated_any_trait:
                user_model_manager.save_user_model(user_model)

            # 3. Atualiza Working Memory
            wm_data = data.get("working_memory_update", {})
            if wm_data:
                topic = wm_data.get("topic")
                task = wm_data.get("task")
                entities = wm_data.get("entities")
                working_memory_store.update(
                    thread_id=thread_id,
                    topic=topic,
                    task=task,
                    entities=entities,
                )

            logger.info(
                f"[MemoryExtractor] Turno analisado para {user_id}: {len(memories)} memórias extraídas, feedback={feedback}"
            )

        except Exception as e:
            logger.warning(f"[MemoryExtractor] Falha silenciosa na extração de memória: {e}")


# Instância global compartilhada
memory_extractor = MemoryExtractor()
