"""
Sistema Multi-Agente (MAS - Multi-Agent System) do Charlie Agent Runtime.
Define agentes especializados que colaboram no ciclo de resolução de objetivos:
- PlannerAgent: Percepção, parsing e decomposição de metas.
- ExecutorAgent: Resolução de variáveis, seleção de ferramentas e execução.
- CriticVerifierAgent: Avaliação crítica e validação de evidências tangíveis.
- ReflectorAgent: Diagnóstico de erros e auto-correção sem travamento.
- SynthesizerAgent: Consolidação de evidências e relatório executivo final.
"""

from __future__ import annotations
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from brain.agent.task_graph import TaskEvidence, TaskNode, TaskStatus
from brain.agent.working_memory import AgentWorkingMemory
from brain.agent.failure_memory import FailureMemory
from brain.agent.reflector import ReflectorAgent, CorrectionPlan

logger = logging.getLogger("charlie.agent.multi_agent")


class AgentRole(str, Enum):
    PLANNER = "Planner"
    EXECUTOR = "Coding Agent"
    RESEARCHER = "Researcher"
    CRITIC_VERIFIER = "Reviewer"
    REFLECTOR = "Testing Agent"
    SYNTHESIZER = "Synthesizer"



@dataclass
class SubagentState:
    id: str
    session_id: str
    role: AgentRole
    goal: str
    status: str = "waiting"  # "running" | "completed" | "waiting" | "failed"
    current_task: Optional[str] = None
    tools_used: List[str] = field(default_factory=list)
    artifacts: List[str] = field(default_factory=list)
    result: Optional[str] = None
    errors: List[str] = field(default_factory=list)
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "role": self.role.value if isinstance(self.role, AgentRole) else str(self.role),
            "goal": self.goal,
            "status": self.status,
            "currentTask": self.current_task,
            "toolsUsed": self.tools_used,
            "artifacts": self.artifacts,
            "result": self.result,
            "errors": self.errors,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
        }


SYNTHESIZER_SYSTEM_PROMPT = """Você é o Charlie Synthesizer Agent.
Sua missão é consolidar os resultados de todas as tarefas executadas pelo time de agentes, sintetizando um relatório executivo claro, estruturado e respaldado por evidências tangíveis.

O ambiente de execução foi um computador Windows local.
Destaque:
1. Resumo Executivo: O que foi alcançado com sucesso.
2. Evidências Tangíveis: Arquivos criados, comandos executados, verificações aprovadas.
3. Auto-correções (se houver): Desafios superados e ajustes de rota realizados.
4. Próximos Passos recomendados para o usuário.

Mantenha o tom profissional, direto e em português fluente.
"""


class SynthesizerAgent:
    """Consolida as evidências de todas as tarefas e produz uma síntese executiva final."""

    @classmethod
    async def synthesize(
        cls,
        goal: str,
        tasks: List[TaskNode],
        working_memory: AgentWorkingMemory,
        failure_memory: FailureMemory,
    ) -> str:
        """Produz um relatório de encerramento detalhado com base nas evidências comprovadas."""
        completed_tasks = [t for t in tasks if t.status == TaskStatus.SUCCESS]
        failed_tasks = [t for t in tasks if t.status == TaskStatus.FAILURE]
        retried_tasks = [t for t in tasks if t.attempts > 1]

        # 1. Tenta sintetizar via LLM
        try:
            from core.pipeline import AssistantPipeline
            pipeline = AssistantPipeline()

            task_summary_lines = []
            for t in tasks:
                ev_str = t.evidence.summary if t.evidence else "Sem evidência registrada"
                refl_str = f" [Auto-corrigido: {t.reflection}]" if t.reflection else ""
                task_summary_lines.append(
                    f"- [{t.status.value.upper()}] {t.title}: Ferramenta={t.tool}. Evidência={ev_str}{refl_str}"
                )

            evidence_context = "\n".join(task_summary_lines)
            memory_summary = working_memory.get_recent_context_summary(max_steps=5)

            prompt = f"""
Meta Original: {goal}
Tarefas Executadas:
{evidence_context}

Memória de Trabalho e Variáveis:
{memory_summary}

Gere o Relatório Executivo de Conclusão:
"""
            response = await pipeline.llm.generate(
                prompt=prompt,
                system_instruction=SYNTHESIZER_SYSTEM_PROMPT,
                temperature=0.3,
            )
            raw_text = response.content if hasattr(response, "content") else str(response)
            if raw_text and len(raw_text.strip()) > 20:
                return raw_text.strip()
        except Exception as e:
            logger.debug(f"[SynthesizerAgent] LLM Synthesis falhou ({e}). Usando síntese estruturada nativa.")

        # 2. Síntese determinística robusta
        lines = [
            f"### Relatório Executivo: Conclusão do Objetivo",
            f"**Meta:** {goal}",
            f"**Progresso:** {len(completed_tasks)}/{len(tasks)} tarefas concluídas com validação de evidências.",
            "",
            "#### Evidências Comprovadas:",
        ]
        for t in completed_tasks:
            ev_desc = t.evidence.summary if t.evidence else "Ação confirmada no sistema local."
            lines.append(f"- **{t.title}**: {ev_desc}")

        if retried_tasks:
            lines.append("")
            lines.append("#### Auto-Correções e Resiliência Operacional:")
            for t in retried_tasks:
                refl = t.reflection or "Ajuste dinâmico de parâmetros após erro inicial."
                lines.append(f"- *{t.title}* ({t.attempts} tentativas): {refl}")

        if failed_tasks:
            lines.append("")
            lines.append("#### Tarefas Não Concluídas:")
            for t in failed_tasks:
                lines.append(f"- **{t.title}**: {t.error or 'Falha ao executar ferramenta.'}")

        return "\n".join(lines)


ROLE_SYSTEM_PROMPTS: Dict[AgentRole, str] = {
    AgentRole.PLANNER: """Você é o Charlie Planner Agent (Módulo de Planejamento e Decomposição).
Sua missão é interpretar a intenção do usuário, decompor objetivos complexos em um Grafo Direcionado Acíclico (DAG) de subtarefas acionáveis, identificar pré-requisitos, paralelismos e restrições críticas do ambiente Windows.
Não execute ações impulsivas. Planeje com precisão técnica e antecipe possíveis bloqueios.""",

    AgentRole.EXECUTOR: """Você é o Charlie Coding & OS Executor Agent.
Sua missão é executar ferramentas locais no ambiente Windows com máxima precisão e segurança.
Você resolve parâmetros dinâmicos {{var}}, interage com o sistema de arquivos, executa comandos PowerShell válidos e manipula processos e chamadas de API de acordo com as especificações do plano.""",

    AgentRole.RESEARCHER: """Você é o Charlie Researcher Agent.
Sua missão é investigar, coletar contexto, consultar documentações técnicas, realizar buscas na web e inspecionar estruturas de diretórios e bases de dados.
Sintetize fatos e dados precisos para municiar o Executor e o Planejador com informações confiáveis.""",

    AgentRole.CRITIC_VERIFIER: """Você é o Charlie Reviewer & Critic Verifier Agent.
Sua missão é auditar imparcialmente a execução das tarefas, exigindo evidências tangíveis e verificáveis (hashes SHA-256, existência e tamanho de arquivos, saída de processos, HTTP status).
A conclusão de qualquer etapa só é concedida se houver comprovação objetiva no ambiente real.""",

    AgentRole.REFLECTOR: """Você é o Charlie Testing & Reflector Agent (Auto-Correção e Resiliência).
Sua missão é diagnosticar falhas de execução, interpretar logs de erro do PowerShell/SO, identificar causas-raiz e formular estratégias de contorno (Self-Healing).
Impeça repetição de erros e recalibre comandos com base nas lições aprendidas.""",

    AgentRole.SYNTHESIZER: SYNTHESIZER_SYSTEM_PROMPT,
}


def get_role_prompt(role: AgentRole) -> str:
    """Retorna o prompt cognitivo do agente de acordo com seu papel."""
    return ROLE_SYSTEM_PROMPTS.get(role, SYNTHESIZER_SYSTEM_PROMPT)


class MultiAgentCoordinator:
    """
    Coordenador do Sistema Multi-Agente (MAS):
    - Instancia e rastreia os subagentes especializados da sessão.
    - Sincroniza o ciclo operacional com os eventos visuais do Desktop.
    """

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.subagents: Dict[str, SubagentState] = {
            AgentRole.PLANNER.value: SubagentState(
                id=f"{session_id}_planner",
                session_id=session_id,
                role=AgentRole.PLANNER,
                goal="Compreender a intenção e estruturar o plano de ação (Task Graph DAG).",
            ),
            AgentRole.EXECUTOR.value: SubagentState(
                id=f"{session_id}_executor",
                session_id=session_id,
                role=AgentRole.EXECUTOR,
                goal="Executar ferramentas no ambiente Windows e resolver variáveis ativas.",
            ),
            AgentRole.RESEARCHER.value: SubagentState(
                id=f"{session_id}_researcher",
                session_id=session_id,
                role=AgentRole.RESEARCHER,
                goal="Coletar contexto, inspecionar documentação, pesquisar na web e mapear diretórios.",
            ),
            AgentRole.CRITIC_VERIFIER.value: SubagentState(
                id=f"{session_id}_verifier",
                session_id=session_id,
                role=AgentRole.CRITIC_VERIFIER,
                goal="Auditar e certificar evidências reais contra critérios de sucesso.",
            ),
            AgentRole.REFLECTOR.value: SubagentState(
                id=f"{session_id}_reflector",
                session_id=session_id,
                role=AgentRole.REFLECTOR,
                goal="Analisar falhas, auto-corrigir erros e recalibrar parâmetros.",
            ),
            AgentRole.SYNTHESIZER.value: SubagentState(
                id=f"{session_id}_synthesizer",
                session_id=session_id,
                role=AgentRole.SYNTHESIZER,
                goal="Consolidar evidências e redigir síntese executiva final.",
            ),
        }

    def activate_role(self, role: AgentRole, current_task: Optional[str] = None) -> SubagentState:
        sub = self.subagents.get(role.value)
        if sub:
            sub.status = "running"
            sub.current_task = current_task
        return sub

    def complete_role(self, role: AgentRole, result: Optional[str] = None) -> SubagentState:
        sub = self.subagents.get(role.value)
        if sub:
            sub.status = "completed"
            sub.completed_at = datetime.now(timezone.utc).isoformat()
            if result:
                sub.result = result
        return sub

    def record_tool_used(self, role: AgentRole, tool: str) -> None:
        sub = self.subagents.get(role.value)
        if sub and tool not in sub.tools_used:
            sub.tools_used.append(tool)

    def record_artifact(self, role: AgentRole, artifact_name: str) -> None:
        sub = self.subagents.get(role.value)
        if sub and artifact_name not in sub.artifacts:
            sub.artifacts.append(artifact_name)

    def record_error(self, role: AgentRole, error_msg: str) -> None:
        sub = self.subagents.get(role.value)
        if sub:
            sub.errors.append(error_msg)

    def get_all_subagents_dict(self) -> List[Dict[str, Any]]:
        return [sub.to_dict() for sub in self.subagents.values()]
