"""
Sistema de Memória de Curto Prazo (Working Memory) do Charlie Agent Runtime.
Gerencia variáveis ativas, estado intermediário da sessão e resolução dinâmica de parâmetros.
"""

from __future__ import annotations
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("charlie.agent.working_memory")


@dataclass
class ReActTraceStep:
    """Representa um passo individual no ciclo ReAct (Thought -> Action -> Observation -> Reflection)."""
    task_id: str
    thought: str
    action: str
    tool: Optional[str] = None
    arguments: Dict[str, Any] = field(default_factory=dict)
    observation: str = ""
    reflection: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "taskId": self.task_id,
            "thought": self.thought,
            "action": self.action,
            "tool": self.tool,
            "arguments": self.arguments,
            "observation": self.observation,
            "reflection": self.reflection,
            "timestamp": self.timestamp,
        }


class AgentWorkingMemory:
    """
    Memória de Curto Prazo do Agente:
    - Armazena variáveis descobertas e criadas durante a sessão ativa (ex.: caminhos, hashes, PIDs).
    - Resolve interpolações de variáveis (ex: {{target_dir}}) nos argumentos de tarefas subsequentes.
    - Mantém a trilha de raciocínio ReAct da sessão ativa.
    """

    def __init__(self, initial_variables: Optional[Dict[str, Any]] = None) -> None:
        self.variables: Dict[str, Any] = initial_variables or {}
        self.trace: List[ReActTraceStep] = []
        self.created_artifacts: List[Dict[str, Any]] = []

    def set_variable(self, key: str, value: Any) -> None:
        """Registra ou atualiza uma variável na memória de trabalho."""
        self.variables[key] = value
        logger.debug(f"[WorkingMemory] Variável registrada: '{key}' = {str(value)[:60]}")

    def get_variable(self, key: str, default: Any = None) -> Any:
        """Recupera uma variável da memória de trabalho."""
        return self.variables.get(key, default)

    def extract_and_store_variables(self, task_id: str, tool: str, arguments: Dict[str, Any], observation: str) -> None:
        """
        Analisa o resultado de uma ferramenta e extrai variáveis úteis para uso futuro.
        Identifica caminhos de arquivo criados, códigos de retorno, dados JSON, etc.
        """
        # 1. Armazena última observação e última ferramenta
        self.set_variable("last_observation", observation)
        self.set_variable("last_tool", tool)
        self.set_variable(f"{task_id}_result", observation)

        # 2. Extrai caminhos se especificados nos argumentos
        if "path" in arguments:
            self.set_variable("last_path", arguments["path"])
            self.set_variable(f"{task_id}_path", arguments["path"])

        # 3. Se a observação for um JSON válido, desempacota campos relevantes
        parsed = None
        try:
            parsed = json.loads(observation)
        except Exception:
            try:
                # Tenta reparar barras invertidas do Windows não escapadas no JSON
                sanitized = re.sub(r'\\(?![/"\\bfnrtu])', r'\\\\', observation)
                parsed = json.loads(sanitized)
            except Exception:
                parsed = None

        if isinstance(parsed, dict):
            for k, v in parsed.items():
                if isinstance(v, (str, int, float, bool)):
                    self.set_variable(f"{task_id}_{k}", v)

        # 4. Procura padrões úteis via regex (ex: caminhos do Windows C:\...)
        windows_paths = re.findall(r'[A-Za-z]:\\[\w\s\-.\\]+', observation)
        if windows_paths:
            self.set_variable("discovered_windows_path", windows_paths[0])
            self.set_variable(f"{task_id}_discovered_path", windows_paths[0])

    def resolve_arguments(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        Substitui variáveis de modelo {{variable_name}} nos argumentos da ferramenta
        pelos valores reais contidos na memória de trabalho.
        """
        if not arguments:
            return {}

        def _resolve_val(val: Any) -> Any:
            if isinstance(val, str):
                # Substitui referências simples {{nome_var}}
                pattern = r'\{\{([\w\-.]+)\}\}'
                matches = re.findall(pattern, val)
                resolved_str = val
                for var_name in matches:
                    if var_name in self.variables:
                        sub_val = str(self.variables[var_name])
                        resolved_str = resolved_str.replace(f"{{{{{var_name}}}}}", sub_val)
                return resolved_str
            elif isinstance(val, dict):
                return {k: _resolve_val(v) for k, v in val.items()}
            elif isinstance(val, list):
                return [_resolve_val(v) for v in val]
            return val

        resolved = {k: _resolve_val(v) for k, v in arguments.items()}
        return resolved

    def record_trace(
        self,
        task_id: str,
        thought: str,
        action: str,
        tool: Optional[str] = None,
        arguments: Optional[Dict[str, Any]] = None,
        observation: str = "",
        reflection: str = "",
    ) -> ReActTraceStep:
        """Registra um ciclo completo de raciocínio ReAct."""
        step = ReActTraceStep(
            task_id=task_id,
            thought=thought,
            action=action,
            tool=tool,
            arguments=arguments or {},
            observation=observation,
            reflection=reflection,
        )
        self.trace.append(step)
        return step

    def get_recent_context_summary(self, max_steps: int = 4) -> str:
        """
        Retorna um resumo contextual conciso dos últimos passos do ReAct e variáveis ativas,
        ideal para injeção no prompt de raciocínio do cérebro (LLM).
        """
        lines = []
        if self.variables:
            lines.append("Estado da Memória de Curto Prazo (Variáveis Conhecidas):")
            for k, v in list(self.variables.items())[-25:]:
                lines.append(f"  - {k}: {str(v)[:100]}")

        if self.trace:
            lines.append("\nÚltimos Passos Executados (ReAct History):")
            recent = self.trace[-max_steps:]
            for step in recent:
                lines.append(f"  [Tarefa {step.task_id}]")
                lines.append(f"    Thought: {step.thought[:120]}")
                lines.append(f"    Action: {step.tool} ({json.dumps(step.arguments)[:80]})")
                if step.observation:
                    lines.append(f"    Observation: {step.observation[:120]}...")
                if step.reflection:
                    lines.append(f"    Critical Reflection: {step.reflection[:120]}")

        return "\n".join(lines) if lines else "Nenhuma observação prévia na memória de trabalho."

    def to_dict(self) -> Dict[str, Any]:
        return {
            "variables": self.variables,
            "trace": [t.to_dict() for t in self.trace],
            "traceCount": len(self.trace),
        }
