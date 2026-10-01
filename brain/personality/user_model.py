"""User Model — Perfil Comportamental Adaptativo do Usuário."""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import psycopg
import os
from dotenv import load_dotenv

load_dotenv()
from config import config
from brain.personality.charlie_core import CharlieCore, PersonalityTraits

logger = logging.getLogger("charlie.brain.user_model")


@dataclass
class CommunicationStyle:
    formality: float = 0.15
    humor: float = 0.85
    directness: float = 0.90
    technical_depth: float = 0.85
    verbosity: float = 0.70

    def to_dict(self) -> Dict[str, float]:
        return {
            "formality": round(self.formality, 3),
            "humor": round(self.humor, 3),
            "directness": round(self.directness, 3),
            "technical_depth": round(self.technical_depth, 3),
            "verbosity": round(self.verbosity, 3),
        }

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "CommunicationStyle":
        if not data:
            return cls()
        return cls(
            formality=float(data.get("formality", 0.15)),
            humor=float(data.get("humor", 0.85)),
            directness=float(data.get("directness", 0.90)),
            technical_depth=float(data.get("technical_depth", 0.85)),
            verbosity=float(data.get("verbosity", 0.70)),
        )


@dataclass
class InteractionPreferences:
    likes_teasing: bool = True
    likes_challenges: bool = True
    likes_deep_explanations: bool = True

    def to_dict(self) -> Dict[str, bool]:
        return {
            "likes_teasing": self.likes_teasing,
            "likes_challenges": self.likes_challenges,
            "likes_deep_explanations": self.likes_deep_explanations,
        }

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "InteractionPreferences":
        if not data:
            return cls()
        return cls(
            likes_teasing=bool(data.get("likes_teasing", True)),
            likes_challenges=bool(data.get("likes_challenges", True)),
            likes_deep_explanations=bool(data.get("likes_deep_explanations", True)),
        )


@dataclass
class UserModel:
    user_id: str
    communication: CommunicationStyle = field(default_factory=CommunicationStyle)
    interaction: InteractionPreferences = field(default_factory=InteractionPreferences)
    traits: Dict[str, Any] = field(default_factory=dict)
    stats: Dict[str, Any] = field(default_factory=lambda: {"total_turns": 0, "observations_count": 0})
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def update_trait(self, trait_name: str, observation_score: float, alpha: float = 0.1) -> float:
        """Aplica atualização exponencial gradual (EMA): novo = 0.9 * antigo + 0.1 * nova_obs."""
        observation_score = max(0.05, min(0.95, observation_score))
        if hasattr(self.communication, trait_name):
            old_val = getattr(self.communication, trait_name)
            new_val = (old_val * (1.0 - alpha)) + (observation_score * alpha)
            new_val = max(0.05, min(0.95, new_val))
            setattr(self.communication, trait_name, new_val)
            self.stats["observations_count"] = self.stats.get("observations_count", 0) + 1
            self.updated_at = datetime.now(timezone.utc).isoformat()
            logger.info(
                f"[UserModel] Trait '{trait_name}' atualizado de {old_val:.2f} para {new_val:.2f} (obs={observation_score:.2f})"
            )
            return new_val
        return 0.0

    def set_interaction_preference(self, key: str, value: bool) -> None:
        if hasattr(self.interaction, key):
            setattr(self.interaction, key, value)
            self.stats["observations_count"] = self.stats.get("observations_count", 0) + 1
            self.updated_at = datetime.now(timezone.utc).isoformat()
            logger.info(f"[UserModel] Preferência de interação '{key}' definida para {value}")

    def format_adaptation_prompt(self, core: Optional[CharlieCore] = None) -> str:
        """Traduz o UserModel em instruções diretas e operacionais de modulação de estilo para a LLM."""
        c = self.communication
        i = self.interaction

        lines = [
            "# ADAPTAÇÃO COMPORTAMENTAL AO USUÁRIO (USER MODEL)",
            "Ajuste a forma como a sua personalidade se expressa de acordo com o padrão aprendido deste usuário:",
        ]

        # Diretividade
        if c.directness >= 0.75:
            lines.append("- **Diretividade ALTA:** Vá direto ao ponto principal. O usuário preza por resolutividade rápida sem preâmbulos redundantes.")
        elif c.directness <= 0.35:
            lines.append("- **Diretividade MODERADA/BAIXA:** O usuário aprecia explicações mais introdutórias e contextualizadas.")

        # Verbosidade
        if c.verbosity <= 0.40:
            lines.append("- **Verbosidade BAIXA:** Seja conciso e econômico no texto. Evite parágrafos longos, salvo se solicitado explicitamente.")
        elif c.verbosity >= 0.75:
            lines.append("- **Verbosidade ABRANGENTE:** O usuário aprecia respostas completas e bem fundamentadas com todos os detalhes pertinentes.")

        # Formalidade
        if c.formality <= 0.30:
            lines.append("- **Formalidade BAIXA:** Fale de forma totalmente natural, informal e descontraída.")
        elif c.formality >= 0.70:
            lines.append("- **Formalidade MODERADA/ALTA:** Adote um tom mais polido e respeitoso.")

        # Profundidade Técnica
        if c.technical_depth >= 0.70:
            lines.append("- **Profundidade Técnica ALTA:** Explique o mecanismo interno, código robusto, arquitetura e conceitos com precisão de engenharia.")
        else:
            lines.append("- **Profundidade Técnica ACESSÍVEL:** Use analogias práticas e evite jargões densos sem necessidade.")

        # Humor e Provocações
        if i.likes_teasing and c.humor >= 0.60:
            lines.append("- **Interação Descontraída:** O usuário tolera e aprecia provocações amistosas, ironia refinada e bom humor entre colegas.")
        elif not i.likes_teasing:
            lines.append("- **Interação Focada:** Mantenha um tom estritamente cooperativo e evite piadas ou brincadeiras com o usuário.")

        return "\n".join(lines)


class UserModelManager:
    """Gerencia a persistência e o cache dos modelos de usuário no Supabase."""

    def __init__(self):
        from api.db import get_normalized_db_url
        self.db_url = get_normalized_db_url()
        self._cache: Dict[str, UserModel] = {}

    def _get_connection(self):
        return psycopg.connect(self.db_url, autocommit=True)

    def get_user_model(self, user_id: str = "default") -> UserModel:
        """Carrega o modelo do usuário do cache ou do Supabase (cria o padrão caso não exista)."""
        if user_id in self._cache:
            return self._cache[user_id]

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        'SELECT communication, interaction, traits, stats, updated_at FROM "UserModel" WHERE user_id = %s',
                        (user_id,),
                    )
                    row = cur.fetchone()
                    if row:
                        comm = CommunicationStyle.from_dict(row[0] if isinstance(row[0], dict) else json.loads(row[0] or "{}"))
                        inter = InteractionPreferences.from_dict(row[1] if isinstance(row[1], dict) else json.loads(row[1] or "{}"))
                        traits = row[2] if isinstance(row[2], dict) else json.loads(row[2] or "{}")
                        stats = row[3] if isinstance(row[3], dict) else json.loads(row[3] or "{}")
                        up_at = row[4].isoformat() if hasattr(row[4], "isoformat") else str(row[4])
                        model = UserModel(
                            user_id=user_id,
                            communication=comm,
                            interaction=inter,
                            traits=traits,
                            stats=stats,
                            updated_at=up_at,
                        )
                    else:
                        model = UserModel(user_id=user_id)
                        self.save_user_model(model)

                    self._cache[user_id] = model
                    return model
        except Exception as e:
            logger.error(f"Erro ao carregar UserModel para {user_id}: {e}")
            fallback = UserModel(user_id=user_id)
            self._cache[user_id] = fallback
            return fallback

    def save_user_model(self, model: UserModel) -> None:
        """Salva as atualizações do modelo do usuário no Supabase."""
        self._cache[model.user_id] = model
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO "UserModel" (user_id, communication, interaction, traits, stats, updated_at)
                        VALUES (%s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (user_id) DO UPDATE 
                        SET communication = EXCLUDED.communication,
                            interaction = EXCLUDED.interaction,
                            traits = EXCLUDED.traits,
                            stats = EXCLUDED.stats,
                            updated_at = NOW()
                        """,
                        (
                            model.user_id,
                            json.dumps(model.communication.to_dict()),
                            json.dumps(model.interaction.to_dict()),
                            json.dumps(model.traits),
                            json.dumps(model.stats),
                        ),
                    )
                    logger.info(f"[UserModel] Perfil de {model.user_id} salvo com sucesso no banco.")
        except Exception as e:
            logger.error(f"Erro ao salvar UserModel para {model.user_id}: {e}")


# Instância global compartilhada
user_model_manager = UserModelManager()
