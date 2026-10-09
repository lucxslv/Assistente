"""
Teste de Validação da Capacidade de Programação do Charlie (Coding Agent):
Valida que, ao receber um pedido para codar uma landing page ou arquivos:
1. O Router identifica RouteMode.AGENTIC
2. O AgentPlanner decompõe a tarefa com create_folder e write_file para index.html e style.css
3. O AgentRuntime executa fisicamente as ferramentas no disco Windows do usuário
4. Os arquivos index.html e style.css existem no disco físico em Documentos\\landing com conteúdo não vazio e semântico.
"""

import asyncio
import os
import sys
from pathlib import Path

# Configura encoding no Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ["CHARLIE_AUTO_APPROVE"] = "1"

from brain.router.router import router, RouteMode
from brain.agent.planner import AgentPlanner
from brain.agent.runtime import AgentRuntime
from tools.file_explorer import resolve_friendly_path


async def test_coding_landing_page():
    goal = "Crie uma landing page para a Barbearia Primus com index.html e style.css na pasta Documentos/landing"
    print(f"\n[1/4] Testando Roteamento da Meta: '{goal}'")
    decision = router.route(goal)
    print(f"  -> Rota detectada: {decision.mode.value} (Modelo: {decision.model_name}, Motivo: {decision.reason})")
    assert decision.mode == RouteMode.AGENTIC, f"Esperado AGENTIC, obtido {decision.mode}"

    print("\n[2/4] Testando Decomposição do Grafo (AgentPlanner)...")
    graph = await AgentPlanner.create_plan(goal, project="Barbearia Primus")
    print(f"  -> Grafo criado com {len(graph.nodes)} tarefas:")
    for t in graph.nodes.values():
        print(f"     - [{t.id}] {t.title} | Ferramenta: {t.tool} | Args: {list(t.arguments.keys())}")

    assert len(graph.nodes) >= 3, f"Esperado ao menos 3 tarefas, obtido {len(graph.nodes)}"
    tools_used = [t.tool for t in graph.nodes.values()]
    assert "write_file" in tools_used, "write_file deve estar no plano de execução!"
    assert "create_folder" in tools_used or "write_file" in tools_used

    print("\n[3/4] Executando Grafo via AgentRuntime...")
    runtime = AgentRuntime()
    runtime.active_graph = graph
    from brain.agent.multi_agent import MultiAgentCoordinator
    runtime.multi_agent_coordinator = MultiAgentCoordinator(session_id="test_coding_run")

    for task in graph.nodes.values():
        print(f"  -> Executando tarefa: {task.title} ({task.tool})...")
        print(f"     Path arg: {task.arguments.get('path')}")
        await runtime._execute_task(task)
        print(f"     Observation: {task.observation[:120] if task.observation else 'None'}")
        print(f"     Evidence: {task.evidence.summary if task.evidence else 'None'}")

    print("\n[4/4] Verificando existência física e integridade dos arquivos no Windows...")
    index_path = resolve_friendly_path("Documentos/landing/index.html")
    css_path = resolve_friendly_path("Documentos/landing/style.css")

    print(f"  -> Caminho do index.html: {index_path}")
    print(f"  -> Caminho do style.css:  {css_path}")

    assert index_path.exists(), f"index.html NÃO foi criado em {index_path}!"
    assert css_path.exists(), f"style.css NÃO foi criado em {css_path}!"

    index_size = index_path.stat().st_size
    css_size = css_path.stat().st_size
    print(f"  -> index.html criado com {index_size} bytes")
    print(f"  -> style.css criado com {css_size} bytes")

    assert index_size > 200, f"index.html está muito pequeno ou vazio ({index_size} bytes)"
    assert css_size > 200, f"style.css está muito pequeno ou vazio ({css_size} bytes)"

    with open(index_path, "r", encoding="utf-8") as f:
        html_code = f.read()
    with open(css_path, "r", encoding="utf-8") as f:
        css_code = f.read()

    assert "<!DOCTYPE html>" in html_code or "<html" in html_code
    assert "Barbearia Primus" in html_code or "barbearia" in html_code.lower()
    assert "--gold" in css_code or "color" in css_code

    print("\n" + "=" * 60)
    print("TESTE DE CODIFICAÇÃO CONCLUÍDO COM 100% DE SUCESSO!")
    print("O CHARLIE AGORA CODA FISICAMENTE NO DISCO DO USUÁRIO!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_coding_landing_page())
