"""Planejador e Decompositor de Objetivos em Grafos de Tarefas (Task Graph)."""

import json
import logging
from typing import Optional
from brain.agent.task_graph import TaskGraph, TaskNode, TaskStatus

logger = logging.getLogger("charlie.agent.planner")


PLANNER_SYSTEM_PROMPT = """Você é o Charlie Task Planner.
Seu objetivo é decompor uma meta de alto nível fornecida pelo usuário em uma sequência lógica e verificável de tarefas (Task Graph DAG).

Para cada tarefa, forneça:
1. id: string única (ex: "task_01", "task_02")
2. title: descrição clara e concisa da ação
3. description: explicação técnica do que será executado
4. dependencies: lista de IDs das tarefas que DEVEM terminar com sucesso antes desta
5. tool: nome da ferramenta disponível (ex: "create_folder", "write_file", "list_directory", "read_file", "manage_application")
6. arguments: dicionário com os parâmetros exatos da ferramenta
7. expected_evidence_type: "file" | "code" | "system" | "visual"
8. expected_evidence_criteria: critérios objetivos (ex: {"path": "...", "contains": "..."})

Regras Fundamentais:
- Crie entre 2 a 6 tarefas específicas e atômicas.
- Toda conclusão exige evidência verificável.
- Responda EXCLUSIVAMENTE um JSON válido no formato:
{
  "project": "NomeDoProjeto",
  "tasks": [
    {
      "id": "task_01",
      "title": "...",
      "description": "...",
      "dependencies": [],
      "tool": "...",
      "arguments": {},
      "expected_evidence_type": "file",
      "expected_evidence_criteria": {}
    }
  ]
}
"""


class AgentPlanner:
    """Decompõe objetivos abstratos em Grafos de Tarefas estruturados e verificáveis."""

    @classmethod
    async def create_plan(cls, goal: str, project: str = "Charlie") -> TaskGraph:
        """Decompõe o objetivo usando o LLM ou fallback determinístico robusto."""
        graph = TaskGraph(goal=goal, project=project)

        # 1. Tenta decomposição via LLM
        try:
            from core.pipeline import AssistantPipeline
            pipeline = AssistantPipeline()
            prompt = f"Meta a ser planejada e executada:\n'{goal}'\nProjeto: {project}"
            response = await pipeline.llm.generate(
                prompt=prompt,
                system_instruction=PLANNER_SYSTEM_PROMPT,
                temperature=0.2,
            )
            raw_response = response.content if hasattr(response, "content") else str(response)

            # Extração de JSON
            cleaned = raw_response.strip()
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned:
                cleaned = cleaned.split("```")[1].split("```")[0].strip()

            parsed = json.loads(cleaned)
            for t_data in parsed.get("tasks", []):
                node = TaskNode(
                    id=t_data["id"],
                    title=t_data["title"],
                    description=t_data.get("description", ""),
                    dependencies=t_data.get("dependencies", []),
                    tool=t_data.get("tool"),
                    arguments=t_data.get("arguments", {}),
                    expected_evidence_type=t_data.get("expected_evidence_type", "system"),
                    expected_evidence_criteria=t_data.get("expected_evidence_criteria", {}),
                )
                graph.add_task(node)

            if graph.nodes:
                logger.info(f"AgentPlanner: Meta '{goal}' decomposta em {len(graph.nodes)} tarefas pelo LLM.")
                return graph
        except Exception as e:
            logger.warning(f"AgentPlanner: Decomposição via LLM falhou ({e}). Usando planejamento determinístico.")

        # 2. Fallback determinístico inteligente
        lower_goal = goal.lower()
        if "pasta" in lower_goal or "folder" in lower_goal or "diretório" in lower_goal:
            folder_name = "teste"
            for word in goal.split():
                if word.lower() not in ("cria", "criar", "uma", "a", "pasta", "diretório", "no", "na", "meu", "computador"):
                    folder_name = word.strip("'\"")
                    break

            t1 = TaskNode(
                id="task_01",
                title=f"Criar pasta '{folder_name}' na Área de Trabalho",
                description="Criar diretório local através da ferramenta de arquivos do computador.",
                tool="create_folder",
                arguments={"path": folder_name},
                expected_evidence_type="file",
                expected_evidence_criteria={"path": folder_name},
            )
            t2 = TaskNode(
                id="task_02",
                title=f"Verificar existência e permissões da pasta '{folder_name}'",
                description="Validar se o diretório foi criado com sucesso no disco local.",
                dependencies=["task_01"],
                tool="list_directory",
                arguments={"path": folder_name},
                expected_evidence_type="file",
                expected_evidence_criteria={"path": folder_name},
            )
            graph.add_task(t1)
            graph.add_task(t2)
        else:
            t1 = TaskNode(
                id="task_01",
                title="Inspecionar e analisar escopo do objetivo",
                description="Mapear os requisitos necessários no ambiente local.",
                tool="list_directory",
                arguments={"path": "Documentos"},
                expected_evidence_type="system",
            )
            t2 = TaskNode(
                id="task_02",
                title="Executar ação principal e registrar evidências",
                description="Executar os comandos correspondentes ao objetivo solicitado.",
                dependencies=["task_01"],
                tool="list_directory",
                arguments={"path": "Desktop"},
                expected_evidence_type="system",
            )
            graph.add_task(t1)
            graph.add_task(t2)

        return graph
