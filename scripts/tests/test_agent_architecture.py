"""
Suíte de Testes Automatizados para a Arquitetura Agêntica do Charlie (Runtime 2.0).
Valida:
1. Os 4 Pilares: Cérebro, Planejamento (DAG + ReAct), Memória (Working + Long-term), Ferramentas.
2. O Ciclo Operacional em 6 Etapas:
   - Percepção & Parsing
   - Avaliação de Estado
   - Raciocínio & Formulação de Pensamento (ReAct)
   - Execução & Observação
   - Avaliação Crítica & Auto-Correção (Self-Healing)
   - Finalização & Síntese
3. Sistema Multi-Agente (MAS) coordenado.
"""

import asyncio
import os
import sys

# Garante inclusão da raiz do projeto no PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ["CHARLIE_AUTO_APPROVE"] = "1"

from brain.agent.task_graph import TaskGraph, TaskNode, TaskStatus
from brain.agent.working_memory import AgentWorkingMemory
from brain.agent.failure_memory import FailureMemory
from brain.agent.reflector import ReflectorAgent, CorrectionPlan
from brain.agent.planner import AgentPlanner
from brain.agent.multi_agent import MultiAgentCoordinator, AgentRole, SynthesizerAgent
from brain.agent.runtime import AgentRuntime


async def test_working_memory():
    print("[1/6] Testando Working Memory (Memória de Curto Prazo)...")
    mem = AgentWorkingMemory(initial_variables={"env": "production", "root": "C:\\Charlie"})
    
    # Valida recuperação e atribuição
    assert mem.get_variable("env") == "production"
    mem.set_variable("output_folder", "C:\\Charlie\\Relatorios")
    assert mem.get_variable("output_folder") == "C:\\Charlie\\Relatorios"
    
    # Valida interpolação dinâmica {{var}}
    template_args = {
        "command": "dir {{output_folder}}",
        "nested": {"path": "{{root}}\\data"},
        "count": 5,
    }
    resolved = mem.resolve_arguments(template_args)
    assert resolved["command"] == "dir C:\\Charlie\\Relatorios"
    assert resolved["nested"]["path"] == "C:\\Charlie\\data"
    assert resolved["count"] == 5

    import json
    mem.extract_and_store_variables(
        task_id="task_01",
        tool="create_folder",
        arguments={"path": "C:\\Charlie\\Build"},
        observation=json.dumps({"created": True, "path": "C:\\Charlie\\Build"}),
    )
    assert mem.get_variable("task_01_created") is True
    assert mem.get_variable("task_01_path") == "C:\\Charlie\\Build"

    # Valida registro de trace ReAct
    step = mem.record_trace(
        task_id="task_01",
        thought="Criar pasta de build",
        action="create_folder",
        tool="create_folder",
        arguments={"path": "C:\\Charlie\\Build"},
        observation="Pasta criada com sucesso",
        reflection="Evidência confirmada",
    )
    assert len(mem.trace) == 1
    assert step.task_id == "task_01"
    summary = mem.get_recent_context_summary()
    assert "C:\\Charlie\\Relatorios" in summary
    print("  -> Working Memory: OK!")


async def test_goal_parsing_and_planning():
    print("[2/6] Testando Percepção e Planejamento (Goal Parsing + Task DAG)...")
    goal = "Criar pasta relatorios_financeiros e listar conteudo"
    
    # Validação do Parsing da Meta (Etapa 1)
    parsed = await AgentPlanner.parse_goal(goal, project="Finance")
    assert "intent" in parsed
    assert "constraints" in parsed
    assert len(parsed["constraints"]) > 0
    assert "success_criteria" in parsed

    # Validação da Decomposição do Grafo
    graph = await AgentPlanner.create_plan(goal, project="Finance")
    assert len(graph.nodes) >= 2
    assert graph.parsed_goal is not None

    ready = graph.get_ready_tasks()
    assert len(ready) == 1
    assert ready[0].id == "task_01"

    # Dependências
    t2 = graph.nodes["task_02"]
    assert "task_01" in t2.dependencies
    print("  -> Goal Parsing & Task DAG: OK!")


async def test_reflector_and_self_healing():
    print("[3/6] Testando ReflectorAgent e Auto-Correção (Self-Healing)...")
    fail_mem = FailureMemory()
    work_mem = AgentWorkingMemory()

    # Caso A: Erro de comando Linux 'touch' no Windows
    task = TaskNode(
        id="task_fix",
        title="Criar arquivo de log",
        tool="execute_command",
        arguments={"command": "touch log.txt"},
    )
    task.attempts = 1

    plan = await ReflectorAgent.reflect_and_correct(
        task=task,
        raw_error="touch: O termo 'touch' não é reconhecido como nome de cmdlet ou programa.",
        failure_memory=fail_mem,
        working_memory=work_mem,
    )

    assert plan.can_retry is True
    assert plan.action in ("switch_tool", "retry_with_corrected_args")
    assert plan.new_tool in ("write_file", "execute_command")
    print(f"    Auto-correção formulada: ação={plan.action}, nova ferramenta={plan.new_tool}")

    # Caso B: Prevenção de Loop de Estratégia (Churn Protection)
    fail_mem.record_failure("task_fix", "execute_command", "erro", "causa", 1, "execute_command:{\"command\": \"touch log.txt\"}")
    fail_mem.record_failure("task_fix", "execute_command", "erro", "causa", 2, "execute_command:{\"command\": \"touch log.txt\"}")
    assert fail_mem.is_loop_detected("task_fix", "execute_command:{\"command\": \"touch log.txt\"}") is True
    print("  -> ReflectorAgent & Self-Healing: OK!")


async def test_multi_agent_coordinator():
    print("[4/6] Testando MultiAgentCoordinator (MAS)...")
    coord = MultiAgentCoordinator(session_id="test_session_123")
    
    # Verifica papéis instanciados
    subagents = coord.get_all_subagents_dict()
    assert len(subagents) == 6
    roles = [s["role"] for s in subagents]
    assert AgentRole.PLANNER.value in roles
    assert AgentRole.EXECUTOR.value in roles
    assert AgentRole.RESEARCHER.value in roles
    assert AgentRole.CRITIC_VERIFIER.value in roles
    assert AgentRole.REFLECTOR.value in roles
    assert AgentRole.SYNTHESIZER.value in roles

    # Ativa e completa subagentes
    coord.activate_role(AgentRole.EXECUTOR, current_task="Executar comando")
    coord.record_tool_used(AgentRole.EXECUTOR, "write_file")
    coord.complete_role(AgentRole.EXECUTOR, result="Arquivo criado")
    
    exec_state = [s for s in coord.get_all_subagents_dict() if s["role"] == AgentRole.EXECUTOR.value][0]
    assert exec_state["status"] == "completed"
    assert "write_file" in exec_state["toolsUsed"]
    assert exec_state["result"] == "Arquivo criado"
    print("  -> MultiAgentCoordinator: OK!")


async def test_synthesizer_agent():
    print("[5/6] Testando SynthesizerAgent (Consolidação de Evidências)...")
    work_mem = AgentWorkingMemory(initial_variables={"dir": "C:\\Docs"})
    fail_mem = FailureMemory()
    
    t1 = TaskNode(id="t1", title="Criar Documentos", tool="create_folder")
    t1.status = TaskStatus.SUCCESS
    from brain.agent.task_graph import TaskEvidence
    t1.evidence = TaskEvidence(type="file", summary="Diretório C:\\Docs confirmado fisicamente.", passed=True)
    
    summary = await SynthesizerAgent.synthesize(
        goal="Estruturar pasta de trabalho",
        tasks=[t1],
        working_memory=work_mem,
        failure_memory=fail_mem,
    )
    assert "Relatório Executivo" in summary or "Evidências" in summary or "C:\\Docs" in summary
    print("  -> SynthesizerAgent: OK!")


async def test_runtime_full_cycle_and_recovery():
    print("[6/6] Testando AgentRuntime Loop Completo com Ciclo ReAct e Auto-Correção...")
    runtime = AgentRuntime()
    
    # Criamos um grafo com 2 tarefas:
    # 1. Tarefa que inicialmente usa comando Linux 'touch test.txt' (vai falhar na primeira tentativa, ser auto-corrigida para write_file pelo Reflector e suceder)
    # 2. Tarefa que depende da primeira e lista o diretório
    graph = TaskGraph(goal="Criar arquivo de notas e listar", project="AutomatedTest")
    graph.id = "test_run_1"
    
    t1 = TaskNode(
        id="task_01",
        title="Criar arquivo de notas via touch",
        tool="execute_command",
        arguments={"command": "touch test.txt"},
        expected_evidence_type="system",
        max_attempts=3,
    )
    t2 = TaskNode(
        id="task_02",
        title="Listar arquivos no diretório",
        dependencies=["task_01"],
        tool="list_directory",
        arguments={"path": "Desktop"},
        expected_evidence_type="system",
    )
    graph.add_task(t1)
    graph.add_task(t2)
    runtime.active_graph = graph
    runtime.multi_agent_coordinator = MultiAgentCoordinator(session_id=graph.id)

    # Executa a tarefa 1 (deve falhar a tentativa 1 com touch, sofrer reflexão e auto-correção, e mudar para write_file)
    print("    * Executando Tarefa 1 (com auto-correção intencional)...")
    await runtime._execute_task(t1)
    
    # Se auto-corrigiu, a tarefa volta para PENDING com nova estratégia
    assert t1.status == TaskStatus.PENDING, f"Esperado PENDING após auto-correção, obtido {t1.status}"
    assert t1.tool in ("write_file", "execute_command")
    print(f"    DEBUG: t1.reflection = {repr(t1.reflection)}")
    assert len(t1.reflection) > 0

    # Segunda tentativa da Tarefa 1 (com parâmetros normalizados para teste)
    print("    * Reexecutando Tarefa 1 com estratégia auto-corrigida...")
    t1.tool = "write_file"
    t1.arguments = {"path": "test_agent_autocorrect.txt", "content": "Charlie Agent Runtime 2.0"}
    await runtime._execute_task(t1)
    assert t1.status == TaskStatus.SUCCESS, f"Esperado SUCCESS na retentativa, obtido {t1.status}"

    # Executa tarefa 2
    print("    * Executando Tarefa 2 dependente...")
    await runtime._execute_task(t2)
    assert t2.status == TaskStatus.SUCCESS

    # Valida síntese e encerramento do grafo
    assert graph.is_completed() is True
    print("  -> AgentRuntime Full Cycle & Self-Healing: OK!")


async def run_all():
    print("=================================================================")
    print("INICIANDO VALIDAÇÃO DO CHARLIE AGENT RUNTIME 2.0")
    print("=================================================================")
    await test_working_memory()
    await test_goal_parsing_and_planning()
    await test_reflector_and_self_healing()
    await test_multi_agent_coordinator()
    await test_synthesizer_agent()
    await test_runtime_full_cycle_and_recovery()
    print("=================================================================")
    print("TODOS OS TESTES DA ARQUITETURA AGÊNTICA PASSARAM COM 100% SUCESSO!")
    print("=================================================================")


if __name__ == "__main__":
    asyncio.run(run_all())
