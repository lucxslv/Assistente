"""
Módulo de Auto-Correção e Raciocínio Reflexivo (Self-Reflection) do Charlie Agent Runtime.
Analisa mensagens de erro, diagnósticos de execução e propõe correções dinâmicas sem travar o fluxo.
"""

from __future__ import annotations
import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional

from brain.agent.task_graph import TaskNode
from brain.agent.failure_memory import FailureMemory
from brain.agent.working_memory import AgentWorkingMemory

logger = logging.getLogger("charlie.agent.reflector")


@dataclass
class CorrectionPlan:
    """Plano de reparo e auto-correção gerado pelo Reflector."""
    can_retry: bool
    action: str  # "retry_with_corrected_args" | "switch_tool" | "abort"
    new_tool: Optional[str] = None
    new_arguments: Dict[str, Any] = None
    diagnosis: str = ""
    hypothesis: str = ""
    explanation: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "canRetry": self.can_retry,
            "action": self.action,
            "newTool": self.new_tool,
            "newArguments": self.new_arguments or {},
            "diagnosis": self.diagnosis,
            "hypothesis": self.hypothesis,
            "explanation": self.explanation,
        }


REFLECTOR_SYSTEM_PROMPT = """Você é o Charlie Self-Reflection Agent.
Sua missão é diagnosticar falhas na execução de ferramentas e prescrever uma correção imediata e viável.
O ambiente operacional é estritamente Windows (PowerShell / Win32).

Ao receber uma tarefa que falhou, você deve:
1. Diagnosticar a causa raiz exata do erro (ex: caminho com espaços sem aspas, comando Linux invocado no Windows, pasta pai não existente, sintaxe inválida no PowerShell).
2. Formular uma nova hipótese para contornar o problema.
3. Propor a ferramenta correta e os novos argumentos corrigidos.
4. NUNCA repetir a mesma estratégia que já falhou.

Responda EXCLUSIVAMENTE um JSON válido no formato:
{
  "can_retry": true,
  "action": "retry_with_corrected_args",
  "new_tool": "execute_command",
  "new_arguments": {"command": "New-Item -ItemType Directory -Path ..."},
  "diagnosis": "O diretório pai não existia ao tentar escrever o arquivo.",
  "hypothesis": "Criando o diretório pai primeiro ou usando New-Item com Force resolverá a criação.",
  "explanation": "Ajustado comando para PowerShell nativo com criação recursiva."
}
"""


class ReflectorAgent:
    """Agente especialista em auto-correção, reflexão crítica e reparo de estratégias."""

    @classmethod
    async def reflect_and_correct(
        cls,
        task: TaskNode,
        raw_error: str,
        failure_memory: FailureMemory,
        working_memory: AgentWorkingMemory,
    ) -> CorrectionPlan:
        """
        Executa auto-correção analítica:
        1. Consulta o histórico de falhas para evitar repetições.
        2. Tenta inferência reflexiva via LLM.
        3. Aplica heurísticas de autocorreção comprovadas para ambiente Windows como fallback.
        """
        logger.info(f"[ReflectorAgent] Analisando falha na tarefa '{task.id}' ({task.tool}). Erro: {raw_error[:100]}")

        # Se as tentativas já atingiram o limite
        if task.attempts >= task.max_attempts:
            summary = failure_memory.get_summary_for_replanner(task.id)
            return CorrectionPlan(
                can_retry=False,
                action="abort",
                diagnosis=f"Número máximo de tentativas ({task.max_attempts}) esgotado após testes de hipóteses.",
                explanation=f"Diagnóstico transparente de evidências:\n{summary}",
            )

        # Checa falhas acumuladas para esta tarefa em failure_memory (limite de 2 tentativas por hipótese/abordagem)
        task_failures = [r for r in failure_memory.records if r.task_id == task.id]
        if len(task_failures) >= 2:
            last_strategy = task_failures[-1].strategy
            if failure_memory.is_loop_detected(task.id, last_strategy):
                logger.warning(
                    f"[ReflectorAgent] Bloqueando repetição após 2 falhas na tarefa '{task.id}'. Exigindo mudança material de estratégia."
                )
                llm_plan = await cls._reflect_with_llm(task, raw_error, failure_memory, working_memory)
                if llm_plan and llm_plan.can_retry and llm_plan.action in ("switch_tool", "switch_strategy"):
                    strategy_sig = f"{llm_plan.new_tool}:{json.dumps(llm_plan.new_arguments or {}, sort_keys=True)}"
                    if not failure_memory.is_loop_detected(task.id, strategy_sig):
                        return llm_plan

                return CorrectionPlan(
                    can_retry=False,
                    action="abort",
                    diagnosis=f"Bloqueio de repetições: 2 falhas consecutivas registradas na mesma hipótese para '{task.id}'. Exigido diagnóstico transparente.",
                    explanation=f"Histórico e evidências analisadas:\n{failure_memory.get_summary_for_replanner(task.id)}",
                )

        # 1. Tenta reflexão profunda via LLM
        llm_plan = await cls._reflect_with_llm(task, raw_error, failure_memory, working_memory)
        if llm_plan and llm_plan.can_retry:
            # Verifica se a nova estratégia não é repetição cega
            strategy_signature = f"{llm_plan.new_tool}:{json.dumps(llm_plan.new_arguments or {}, sort_keys=True)}"
            if not failure_memory.is_loop_detected(task.id, strategy_signature):
                logger.info(f"[ReflectorAgent] Plano de auto-correção formulado via LLM: {llm_plan.action}")
                return llm_plan
            else:
                logger.warning("[ReflectorAgent] LLM sugeriu estratégia já falha. Ativando heurística especializada.")

        # 2. Heurística especializada de autocorreção para Windows / PowerShell
        heuristic_plan = cls._reflect_with_heuristics(task, raw_error)
        heur_sig = f"{heuristic_plan.new_tool}:{json.dumps(heuristic_plan.new_arguments or {}, sort_keys=True)}"
        if failure_memory.is_loop_detected(task.id, heur_sig):
            return CorrectionPlan(
                can_retry=False,
                action="abort",
                diagnosis=f"Estratégia bloqueada após 2 falhas na mesma abordagem: {heur_sig}. Diagnóstico transparente requerido.",
                explanation=failure_memory.get_summary_for_replanner(task.id),
            )
        return heuristic_plan

    @classmethod
    async def _reflect_with_llm(
        cls,
        task: TaskNode,
        raw_error: str,
        failure_memory: FailureMemory,
        working_memory: AgentWorkingMemory,
    ) -> Optional[CorrectionPlan]:
        try:
            from core.pipeline import AssistantPipeline
            pipeline = AssistantPipeline()

            failure_history = failure_memory.get_summary_for_replanner(task.id)
            context_summary = working_memory.get_recent_context_summary(max_steps=3)

            prompt = f"""
Tarefa: {task.title}
Descrição: {task.description}
Ferramenta utilizada: {task.tool}
Argumentos utilizados: {json.dumps(task.arguments, ensure_ascii=False)}
Erro observado:
{raw_error}

{failure_history}

{context_summary}

Prescreva o plano de correção estruturado em JSON:
"""
            response = await pipeline.llm.generate(
                prompt=prompt,
                system_instruction=REFLECTOR_SYSTEM_PROMPT,
                temperature=0.1,
            )

            raw_text = response.content if hasattr(response, "content") else str(response)
            cleaned = raw_text.strip()
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned:
                cleaned = cleaned.split("```")[1].split("```")[0].strip()

            parsed = json.loads(cleaned)
            return CorrectionPlan(
                can_retry=bool(parsed.get("can_retry", True)),
                action=parsed.get("action", "retry_with_corrected_args"),
                new_tool=parsed.get("new_tool") or task.tool,
                new_arguments=parsed.get("new_arguments") or task.arguments,
                diagnosis=parsed.get("diagnosis", ""),
                hypothesis=parsed.get("hypothesis", ""),
                explanation=parsed.get("explanation", ""),
            )
        except Exception as e:
            logger.debug(f"[ReflectorAgent] LLM Reflection falhou ({e}), usando heurísticas.")
            return None

    @classmethod
    def _reflect_with_heuristics(cls, task: TaskNode, raw_error: str) -> CorrectionPlan:
        """Heurísticas determinísticas de auto-correção para padrões comuns de erro no Windows."""
        lower_err = raw_error.lower()
        args = dict(task.arguments)

        # Caso 1: Caminho não encontrado ou diretório pai inexistente
        if "não foi encontrado" in lower_err or "not found" in lower_err or "cannot find the path" in lower_err:
            if task.tool == "write_file" and "path" in args:
                # Altera para create_folder primeiro ou usa write_file garantindo caminho absoluto
                path = args["path"]
                clean_path = path.replace("/", "\\")
                return CorrectionPlan(
                    can_retry=True,
                    action="retry_with_corrected_args",
                    new_tool="write_file",
                    new_arguments={**args, "path": clean_path},
                    diagnosis="Caminho relativo ou formatação de barras inválida no Windows.",
                    hypothesis="Normalizar separadores de caminho para estilo Windows (\\) resolverá o acesso.",
                    explanation="Caminho normalizado com separadores de barras invertidas.",
                )

        # Caso 2: Comando PowerShell com erro de aspas ou caracteres especiais
        if task.tool in ("execute_command", "run_command"):
            cmd = args.get("command", "")
            # Se tentou comando linux comum (ls, rm, touch)
            if cmd.startswith("touch "):
                filename = cmd.replace("touch ", "").strip()
                return CorrectionPlan(
                    can_retry=True,
                    action="switch_tool",
                    new_tool="write_file",
                    new_arguments={"path": filename, "content": ""},
                    diagnosis="Comando 'touch' do Linux não é suportado nativamente no Windows CMD.",
                    hypothesis="Utilizar a ferramenta nativa 'write_file' para criar arquivo vazio.",
                    explanation="Substituído comando Linux por ferramenta nativa de sistema de arquivos.",
                )

            if "mkdir " in cmd and ("-p" in cmd or "/" in cmd):
                dir_name = re.sub(r'mkdir\s+(-p\s+)?', '', cmd).strip()
                return CorrectionPlan(
                    can_retry=True,
                    action="switch_tool",
                    new_tool="create_folder",
                    new_arguments={"path": dir_name},
                    diagnosis="Sintaxe 'mkdir -p' é padrão Linux/Unix, falhando no PowerShell.",
                    hypothesis="Utilizar a ferramenta dedicada 'create_folder' com criação recursiva.",
                    explanation="Substituído por ferramenta nativa create_folder.",
                )

            # Aspas em caminhos com espaços
            if " " in cmd and '"' not in cmd and "'" not in cmd:
                return CorrectionPlan(
                    can_retry=True,
                    action="retry_with_corrected_args",
                    new_tool="execute_command",
                    new_arguments={"command": f'cmd /c "{cmd}"'},
                    diagnosis="Caminho ou parâmetros com espaço sem escape adequado.",
                    hypothesis="Encapsular execução via cmd /c com aspas duplas protege contra quebra de argumentos.",
                    explanation="Encapsulado com aspas de proteção.",
                )

        # Fallback padrão: tenta mais uma vez com parâmetros limpos
        return CorrectionPlan(
            can_retry=task.attempts < task.max_attempts,
            action="retry_with_corrected_args" if task.attempts < task.max_attempts else "abort",
            new_tool=task.tool,
            new_arguments=args,
            diagnosis="Erro de execução no ambiente do sistema.",
            hypothesis="Reexecutar com parâmetros sanitizados.",
            explanation="Tentativa adicional de estabilização.",
        )
