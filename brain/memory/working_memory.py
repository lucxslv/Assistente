"""Working Memory — Memória de Trabalho da Sessão / Conversa Atual."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass
class WorkingMemory:
    """Representa o estado imediato do que está acontecendo na conversa atual."""
    current_topic: Optional[str] = None
    current_task: Optional[str] = None
    current_goal: Optional[str] = None
    recent_entities: List[str] = field(default_factory=list)
    emotional_tone: str = "casual"  # casual, technical, playful, serious, urgent
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def update(
        self,
        topic: Optional[str] = None,
        task: Optional[str] = None,
        goal: Optional[str] = None,
        entities: Optional[List[str]] = None,
        tone: Optional[str] = None,
    ) -> None:
        if topic:
            self.current_topic = topic
        if task:
            self.current_task = task
        if goal:
            self.current_goal = goal
        if entities:
            # Mantém as últimas 10 entidades únicas
            combined = list(dict.fromkeys(self.recent_entities + entities))
            self.recent_entities = combined[-10:]
        if tone:
            self.emotional_tone = tone
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "current_topic": self.current_topic,
            "current_task": self.current_task,
            "current_goal": self.current_goal,
            "recent_entities": self.recent_entities,
            "emotional_tone": self.emotional_tone,
            "updated_at": self.updated_at,
        }

    def format_for_prompt(self) -> str:
        lines = []
        if self.current_topic:
            lines.append(f"- **Tópico em Foco:** {self.current_topic}")
        if self.current_task:
            lines.append(f"- **Tarefa em Andamento:** {self.current_task}")
        if self.current_goal:
            lines.append(f"- **Objetivo Imediato:** {self.current_goal}")
        if self.recent_entities:
            lines.append(f"- **Entidades Recentes:** {', '.join(self.recent_entities)}")
        if self.emotional_tone and self.emotional_tone != "casual":
            lines.append(f"- **Tom da Interação:** {self.emotional_tone}")

        if not lines:
            return ""
        return "## Estado da Conversa Atual (Working Memory):\n" + "\n".join(lines)


class WorkingMemoryStore:
    """Armazenador em memória volátil de WorkingMemory indexado por thread_id/session_id."""

    def __init__(self):
        self._store: Dict[str, WorkingMemory] = {}

    def get(self, thread_id: Optional[str]) -> WorkingMemory:
        key = thread_id or "default_session"
        if key not in self._store:
            self._store[key] = WorkingMemory()
        return self._store[key]

    def update(
        self,
        thread_id: Optional[str],
        topic: Optional[str] = None,
        task: Optional[str] = None,
        goal: Optional[str] = None,
        entities: Optional[List[str]] = None,
        tone: Optional[str] = None,
    ) -> WorkingMemory:
        wm = self.get(thread_id)
        wm.update(topic=topic, task=task, goal=goal, entities=entities, tone=tone)
        return wm


# Instância global compartilhada
working_memory_store = WorkingMemoryStore()
