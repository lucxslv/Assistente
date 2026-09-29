"""Núcleo da Assistente — Engine e Pipeline."""

try:
    from core.engine import AssistantEngine
except Exception:
    AssistantEngine = None

from core.pipeline import AssistantPipeline

__all__ = ["AssistantEngine", "AssistantPipeline"]