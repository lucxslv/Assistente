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

EXTRACTION_SYSTEM_PROMPT = """Você é o Extrator de Memória e Analista Comportamental do assistente Charlie.
Sua função é analisar o último turno da conversa (mensagem do usuário e resposta do Charlie) e produzir um JSON com:
1. Novas memórias duradouras que merecem ser lembradas (semânticas ou episódicas).
2. Ajustes graduais no modelo de comunicação do usuário (comportamento e preferências de estilo).
3. Estado atualizado da Working Memory (tópico, tarefa, entidades em discussão).

# CRITÉRIOS DE MEMORIZAÇÃO
- NÃO guarde saudações ou bate-papos triviais descartáveis (ex: "oi", "tudo bem").
- Guarde FATOS relevantes sobre o usuário (projetos, profissão, ferramentas usadas, problemas recorrentes).
- Guarde PREFERÊNCIAS EXPLÍCITAS ou REGRAS ditas pelo usuário (ex: "odeio respostas longas", "prefiro Python").
- Guarde EPISÓDIOS (marcos alcançados, decisões de arquitetura tomadas, acontecimentos de impacto).
- Associe cada memória a:
  - type: "semantic_preference", "semantic_fact", "semantic_learning", "episodic_event"
  - confidence: 0.1 a 1.0 (afirmações explícitas têm confiança alta >= 0.85; deduções têm confiança moderada 0.4-0.7)
  - importance: 0.1 a 1.0 (relevância futura de 0 a 1)
  - action: "reinforce" (fato novo ou reforço de preferência) OU "supersede" (se contradizer, anular ou substituir uma preferência/hábito anterior)

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
      "importance": 0.75,
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
        if len(user_text.strip()) < 5 and user_text.lower().strip() in ["ok", "beleza", "sim", "não", "valeu", "show"]:
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
                        generation_config={"response_mime_type": "application/json", "temperature": 0.2},
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

            # 1. Processa memórias candidatas com deduplicação e reforço
            memories = data.get("memories", [])
            for m in memories:
                content = m.get("content", "").strip()
                if not content or len(content) < 8:
                    continue
                m_type = m.get("type", "semantic_fact")
                conf = float(m.get("confidence", 0.8))
                imp = float(m.get("importance", 0.5))

                action = m.get("action", "reinforce")
                saved_via_pool = False
                try:
                    from api.db import get_or_init_db_pool
                    from api.services.chat_persistence import save_user_memory_entry
                    pool = await get_or_init_db_pool()
                    if pool:
                        res_id = await save_user_memory_entry(pool, user_id=user_id, fact=content, category=m_type)
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
