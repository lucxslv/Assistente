"""Memória Procedural e Aprendizado por Experiência (Cross-Session Experience) para o Charlie Agent Runtime."""

from __future__ import annotations
import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("charlie.agent.experience")

EXPERIENCE_FILE = Path(__file__).resolve().parent.parent.parent / "agent_experience_lessons.json"


@dataclass
class ExperienceLesson:
    id: str
    intent_pattern: str
    root_cause_error: str
    successful_correction: str
    tags: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "intentPattern": self.intent_pattern,
            "rootCauseError": self.root_cause_error,
            "successfulCorrection": self.successful_correction,
            "tags": self.tags,
            "createdAt": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ExperienceLesson:
        return cls(
            id=data.get("id", f"les_{uuid.uuid4().hex[:8]}"),
            intent_pattern=data.get("intentPattern", ""),
            root_cause_error=data.get("rootCauseError", ""),
            successful_correction=data.get("successfulCorrection", ""),
            tags=data.get("tags", []),
            created_at=data.get("createdAt", datetime.now(timezone.utc).isoformat()),
        )


class ExperienceMemory:
    """Armazena lições aprendidas de execuções passadas para prevenir erros recorrentes no Windows."""

    def __init__(self, storage_path: Path = EXPERIENCE_FILE) -> None:
        self.storage_path = storage_path
        self._lessons: List[ExperienceLesson] = []
        self._load()
        if not self._lessons:
            self._seed_default_lessons()

    def _seed_default_lessons(self):
        """Lições procedurais pré-carregadas para o ecossistema Windows."""
        default_lessons = [
            ExperienceLesson(
                id="les_touch_windows",
                intent_pattern="criação de arquivo vazio no terminal",
                root_cause_error="Comando 'touch' não é nativo do Windows PowerShell ou CMD.",
                successful_correction="Use a ferramenta 'write_file' diretamente ou o comando PowerShell 'New-Item -ItemType File -Force'.",
                tags=["windows", "powershell", "touch", "arquivo"],
            ),
            ExperienceLesson(
                id="les_grep_windows",
                intent_pattern="busca de padrão de texto em arquivos",
                root_cause_error="Comando 'grep' falha no Windows sem Git Bash instalado.",
                successful_correction="Use 'Select-String -Pattern <termo>' no PowerShell ou scripts Python.",
                tags=["windows", "powershell", "grep", "busca"],
            ),
            ExperienceLesson(
                id="les_encoding_utf8",
                intent_pattern="escrita de scripts ou arquivos com caracteres acentuados",
                root_cause_error="Codificação ANSI/CP1252 padrão do Windows corrompe acentos em arquivos gerados.",
                successful_correction="Sempre passe encoding UTF-8 explícito ou use 'Out-File -Encoding utf8'.",
                tags=["windows", "encoding", "utf8", "acentos"],
            ),
            ExperienceLesson(
                id="les_pip_venv",
                intent_pattern="instalação de dependências python",
                root_cause_error="Executar 'pip install' global pode falhar por falta de permissão ou poluir o sistema.",
                successful_correction="Use sempre o Python do ambiente virtual '.venv\\Scripts\\python.exe -m pip' ou o gerenciador 'uv add'.",
                tags=["python", "pip", "venv", "uv"],
            ),
            ExperienceLesson(
                id="les_rm_rf",
                intent_pattern="remoção recursiva de diretórios",
                root_cause_error="'rm -rf' não funciona no CMD padrão do Windows.",
                successful_correction="Use PowerShell 'Remove-Item -Recurse -Force' ou rmdir /s /q.",
                tags=["windows", "rm", "powershell", "pastas"],
            ),
        ]
        self._lessons.extend(default_lessons)
        self._save()

    def _load(self):
        if self.storage_path.exists():
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._lessons = [ExperienceLesson.from_dict(d) for d in data]
            except Exception as e:
                logger.warning(f"ExperienceMemory: Erro ao carregar lições: {e}")

    def _save(self):
        try:
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump([l.to_dict() for l in self._lessons], f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"ExperienceMemory: Erro ao salvar lições: {e}")

    def record_lesson(
        self,
        intent_pattern: str,
        root_cause_error: str,
        successful_correction: str,
        tags: Optional[List[str]] = None,
    ) -> ExperienceLesson:
        """Registra uma nova lição aprendida após auto-correção bem-sucedida pelo Reflector."""
        lesson = ExperienceLesson(
            id=f"les_{uuid.uuid4().hex[:8]}",
            intent_pattern=intent_pattern,
            root_cause_error=root_cause_error,
            successful_correction=successful_correction,
            tags=tags or ["auto_healed", "windows"],
        )
        self._lessons.append(lesson)
        self._save()
        logger.info(f"ExperienceMemory: Nova lição registrada: '{intent_pattern}' -> '{successful_correction}'")
        return lesson

    def get_relevant_lessons(self, goal: str, max_lessons: int = 3) -> List[ExperienceLesson]:
        """
        Recupera lições procedurais relevantes para injetar no planejador antes de criar o plano (Pre-Flight Retrieval).
        """
        normalized_goal = goal.lower()
        scored: List[tuple[int, ExperienceLesson]] = []

        for lesson in self._lessons:
            score = 0
            # Pontuação por termos de intenção
            for word in lesson.intent_pattern.lower().split():
                if len(word) > 3 and word in normalized_goal:
                    score += 2
            # Pontuação por tags
            for tag in lesson.tags:
                if tag.lower() in normalized_goal:
                    score += 3

            if score > 0:
                scored.append((score, lesson))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:max_lessons]]

    def get_all_lessons(self) -> List[Dict[str, Any]]:
        return [l.to_dict() for l in self._lessons]


# Instância global singleton de Memória Procedural
experience_memory = ExperienceMemory()
