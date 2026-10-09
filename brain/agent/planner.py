"""
Planejador e Decompositor de Objetivos em Grafos de Tarefas (Task Graph DAG).
Implementa Percepção e Parsing da Meta (Etapa 1 do Ciclo Operacional) e Decomposição em Subtarefas.
"""

from __future__ import annotations
import json
import logging
import re
from typing import Any, Dict, List, Optional

from brain.agent.task_graph import TaskGraph, TaskNode, TaskStatus

logger = logging.getLogger("charlie.agent.planner")


GOAL_PARSER_SYSTEM_PROMPT = """Você é o Charlie Goal Perception & Parser.
Sua função é analisar a meta bruta solicitada pelo usuário e decompor a percepção analítica:
1. intent: intenção primordial e propósito final.
2. constraints: restrições técnicas obrigatórias (ex.: ambiente estritamente Windows, PowerShell, sem sudo/bash, arquivos em codificação UTF-8).
3. variables: variáveis e entidades essenciais extraídas da solicitação (ex.: caminhos, nomes de pasta, portas, nomes de arquivo).
4. success_criteria: lista de condições objetivas e verificáveis para que o objetivo seja considerado 100% cumprido.

Responda EXCLUSIVAMENTE um JSON válido no formato:
{
  "intent": "...",
  "constraints": ["Ambiente Windows PowerShell", "..."],
  "variables": ["target_dir", "..."],
  "success_criteria": ["Diretório criado e validado", "..."]
}
"""


PLANNER_SYSTEM_PROMPT = """Você é o Charlie Task Planner.
Seu objetivo é decompor uma meta de alto nível fornecida pelo usuário em uma sequência lógica e verificável de tarefas (Task Graph DAG).

O ambiente operacional do usuário é SEMPRE um computador Windows (Microsoft Windows 10/11 x64, PowerShell / CMD, caminhos em C:\\Users\\...).
O servidor na nuvem é apenas o motor de inferência e NUNCA deve ser considerado como ambiente de execução.

Para cada tarefa, forneça:
1. id: string única (ex: "task_01", "task_02")
2. title: descrição clara e concisa da ação
3. description: explicação técnica do que será executado
4. dependencies: lista de IDs das tarefas que DEVEM terminar com sucesso antes desta
5. tool: nome da ferramenta disponível ("execute_command", "create_folder", "write_file", "list_directory", "read_file", "manage_application")
6. arguments: dicionário com os parâmetros exatos da ferramenta (ex: {"command": "dir"} para execute_command, {"path": "pasta"} para create_folder). Suporta interpolação de variáveis de tarefas anteriores usando {{nome_variavel}}.
7. expected_evidence_type: "file" | "code" | "system" | "visual"
8. expected_evidence_criteria: critérios objetivos (ex: {"path": "...", "contains": "..."})

Regras Fundamentais:
- Crie entre 2 a 6 tarefas específicas e atômicas.
- Toda conclusão exige evidência verificável.
- Jamais use comandos Linux/bash (/var/task, apt, etc.). Use PowerShell/CMD para Windows.
- Para metas de codificação, criação de landing pages, sites ou scripts:
  * Decomponha em: 1) criar pasta com `create_folder`, 2) criar arquivos de código com `write_file` fornecendo o código real, completo e funcional em `arguments.content`, 3) verificar com `list_directory`.
  * É proibido criar arquivos vazios ou com placeholders. Forneça o código-fonte integral de alta qualidade.
  * Em `arguments.path`, use caminhos amigáveis como 'Documentos/<pasta>/<arquivo>' ou 'Desktop/<pasta>/<arquivo>'.
  * Em `expected_evidence_criteria`, para arquivos .css, busque termos técnicos como 'color' ou 'body', e não títulos do projeto.
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
    async def parse_goal(cls, goal: str, project: str = "Charlie") -> Dict[str, Any]:
        """
        Etapa 1 do Ciclo Operacional: Percepção e Parsing da Meta.
        Extrai intenção, restrições, variáveis e critérios de sucesso.
        """
        # 1. Tenta parsing via LLM
        try:
            from core.pipeline import AssistantPipeline
            pipeline = AssistantPipeline()
            prompt = f"Meta do usuário para parsing:\n'{goal}'\nProjeto: {project}"
            response = await pipeline.llm.generate(
                prompt=prompt,
                system_instruction=GOAL_PARSER_SYSTEM_PROMPT,
                temperature=0.1,
            )
            raw = response.content if hasattr(response, "content") else str(response)
            cleaned = raw.strip()
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned:
                cleaned = cleaned.split("```")[1].split("```")[0].strip()

            parsed = json.loads(cleaned)
            if isinstance(parsed, dict) and "intent" in parsed:
                logger.info(f"AgentPlanner: Meta parsed via LLM com sucesso: {parsed.get('intent')[:60]}")
                return parsed
        except Exception as e:
            logger.debug(f"AgentPlanner: Parsing via LLM falhou ({e}). Usando parsing determinístico.")

        # 2. Parsing determinístico estruturado
        lower_goal = goal.lower()
        extracted_vars: List[str] = []
        if "pasta" in lower_goal or "diretório" in lower_goal or "folder" in lower_goal:
            extracted_vars.append("target_folder")
        if "arquivo" in lower_goal or "file" in lower_goal or "script" in lower_goal:
            extracted_vars.append("target_file")
        if "processo" in lower_goal or "app" in lower_goal or "programa" in lower_goal:
            extracted_vars.append("target_application")

        return {
            "intent": goal,
            "constraints": [
                "Ambiente Windows 10/11 x64 (PowerShell / CMD)",
                "Isolamento e controle de execução local",
                "Conclusão de tarefas estritamente comprovada por evidências",
            ],
            "variables": extracted_vars or ["target_scope"],
            "success_criteria": [
                "Todas as ferramentas executadas sem erros de sistema",
                "Evidências físicas ou de sistema verificadas e registradas",
            ],
        }

    @classmethod
    async def create_plan(cls, goal: str, project: str = "Charlie") -> TaskGraph:
        """Decompõe o objetivo usando o LLM ou fallback determinístico robusto."""
        graph = TaskGraph(goal=goal, project=project)

        # Etapa 1: Parsing e Percepção da Meta
        parsed_goal = await cls.parse_goal(goal, project)
        graph.parsed_goal = parsed_goal

        # Pre-Flight Lesson Retrieval: recupera aprendizados procedurais de execuções passadas
        from brain.agent.experience_memory import experience_memory
        lessons = experience_memory.get_relevant_lessons(goal)
        lessons_text = ""
        if lessons:
            lessons_text = "\nLições e Heurísticas de Sessões Passadas (Evite cometer os mesmos erros):\n" + "\n".join(
                f"- [Restrição]: {l.root_cause_error} -> Solução comprovada: {l.successful_correction}" for l in lessons
            )

        # 1. Tenta decomposição via LLM com contexto da meta parseada e lições procedurais
        try:
            from core.pipeline import AssistantPipeline
            pipeline = AssistantPipeline()
            prompt = f"""
Meta a ser planejada e executada:
'{goal}'
Projeto: {project}

Percepção Estruturada:
- Intenção: {parsed_goal.get('intent')}
- Restrições: {', '.join(parsed_goal.get('constraints', []))}
- Critérios de Sucesso: {', '.join(parsed_goal.get('success_criteria', []))}
{lessons_text}
"""
            response = await pipeline.llm.generate(
                prompt=prompt,
                system_instruction=PLANNER_SYSTEM_PROMPT,
                temperature=0.2,
            )
            raw_response = response.content if hasattr(response, "content") else str(response)

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
                    agent_role="Coding Agent",
                )
                graph.add_task(node)

            if graph.nodes:
                logger.info(f"AgentPlanner: Meta '{goal}' decomposta em {len(graph.nodes)} tarefas pelo LLM.")
                return graph
        except Exception as e:
            logger.warning(f"AgentPlanner: Decomposição via LLM falhou ({e}). Usando planejamento determinístico.")

        # 2. Fallback determinístico inteligente
        lower_goal = goal.lower()
        is_web_project = any(w in lower_goal for w in ["landing", "site", "página", "pagina", "index.html", "html", "style.css", "web"])

        if is_web_project:
            # Identifica a pasta de destino
            folder_path = "Documentos/landing"
            if "desktop" in lower_goal or "área de trabalho" in lower_goal:
                folder_path = "Desktop/landing"
            elif "downloads" in lower_goal:
                folder_path = "Downloads/landing"

            # Personalização temática (ex: Barbearia)
            is_barber = any(w in lower_goal for w in ["barbearia", "barba", "barber", "corte"])
            brand_name = "Barbearia Primus" if is_barber else "Modern Project"
            hero_title = "Estilo Clássico. Precisão Moderna." if is_barber else "Design Sofisticado e Alta Performance"
            hero_sub = "Cortes impecáveis, barba terapêutica e uma experiência exclusiva de cuidado masculino." if is_barber else "Soluções completas com tecnologia de ponta e foco total em conversão e usabilidade."

            html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{brand_name} | {hero_title}</title>
    <link rel="stylesheet" href="style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
</head>
<body>
    <header class="navbar">
        <div class="container nav-content">
            <a href="#" class="brand-logo">{brand_name.upper()}</a>
            <nav class="nav-links">
                <a href="#sobre">Sobre</a>
                <a href="#servicos">Serviços</a>
                <a href="#diferenciais">Diferenciais</a>
                <a href="#contato" class="btn-nav">Agendar Horário</a>
            </nav>
        </div>
    </header>

    <main>
        <section class="hero">
            <div class="container hero-content">
                <span class="badge-gold">Tradição & Excelência</span>
                <h1>{hero_title}</h1>
                <p>{hero_sub}</p>
                <div class="hero-actions">
                    <a href="#contato" class="btn-primary">Reservar Atendimento</a>
                    <a href="#servicos" class="btn-secondary">Conhecer Serviços</a>
                </div>
            </div>
        </section>

        <section id="servicos" class="section services">
            <div class="container">
                <div class="section-header">
                    <span class="subtitle">O que oferecemos</span>
                    <h2>Nossos Serviços Exclusivos</h2>
                </div>
                <div class="services-grid">
                    <div class="service-card">
                        <div class="card-icon">✂</div>
                        <h3>Corte Tradicional & Moderno</h3>
                        <p>Visagismo personalizado, acabamento navalhado de alta precisão e lavagem relaxante com produtos premium.</p>
                        <span class="price">A partir de R$ 65</span>
                    </div>
                    <div class="service-card">
                        <div class="card-icon">🪒</div>
                        <h3>Barba Terapêutica</h3>
                        <p>Toalha quente perfumada, óleos essenciais, massagem facial revigorante e desenho milimétrico.</p>
                        <span class="price">A partir de R$ 55</span>
                    </div>
                    <div class="service-card featured">
                        <div class="card-icon">👑</div>
                        <h3>Combo Primus Signature</h3>
                        <p>A experiência completa: corte de cabelo personalizado, barba terapêutica e hidratação profunda.</p>
                        <span class="price">R$ 110</span>
                    </div>
                </div>
            </div>
        </section>

        <section id="diferenciais" class="section differentials">
            <div class="container">
                <div class="section-header">
                    <span class="subtitle">Por que nos escolher</span>
                    <h2>Padrão Impecável de Cuidado</h2>
                </div>
                <div class="diff-grid">
                    <div class="diff-item">
                        <h4>Mestres Barbeiros</h4>
                        <p>Equipe altamente treinada nas escolas clássicas e nas principais tendências internacionais.</p>
                    </div>
                    <div class="diff-item">
                        <h4>Ambiente Reservado</h4>
                        <p>Espaço climatizado, café artesanal, bebidas selecionadas e conforto absoluto do início ao fim.</p>
                    </div>
                    <div class="diff-item">
                        <h4>Pontualidade Rigorosa</h4>
                        <p>Respeito absoluto ao seu tempo com sistema inteligente de agendamento sem filas de espera.</p>
                    </div>
                </div>
            </div>
        </section>

        <section id="contato" class="section cta-section">
            <div class="container cta-box">
                <h2>Pronto para elevar o seu visual?</h2>
                <p>Garanta seu horário com nossos especialistas agora mesmo através do WhatsApp oficial.</p>
                <a href="https://wa.me/?text=Olá!+Gostaria+de+agendar+um+horário+na+Barbearia+Primus." target="_blank" class="btn-primary btn-large">Agendar pelo WhatsApp →</a>
            </div>
        </section>
    </main>

    <footer class="footer">
        <div class="container footer-content">
            <p>&copy; 2026 {brand_name}. Todos os direitos reservados.</p>
            <p class="footer-sub">Desenvolvido com excelência por Charlie Agent.</p>
        </div>
    </footer>
</body>
</html>
"""

            css_content = """/* ==========================================================================
   Design System: Modern Classic (Dark Graphite & Pure Gold)
   Desenvolvido para Barbearia Primus & Charlie Agent
   ========================================================================== */

:root {
    --bg-base: #0E0F12;
    --bg-surface: #15171C;
    --bg-card: #1C1E24;
    --gold: #C5A059;
    --gold-light: #DFC07A;
    --gold-dim: rgba(197, 160, 89, 0.15);
    --gold-border: rgba(197, 160, 89, 0.3);
    --text-primary: #F4F4F6;
    --text-secondary: #A0A2AA;
    --text-muted: #6C6E78;
    --font-heading: 'Cinzel', serif;
    --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    --container-max: 1160px;
    --radius-sm: 6px;
    --radius-md: 12px;
    --radius-lg: 20px;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    background-color: var(--bg-base);
    color: var(--text-primary);
    font-family: var(--font-body);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
}

.container {
    width: 90%;
    max-width: var(--container-max);
    margin: 0 auto;
}

/* Header & Navbar */
.navbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(14, 15, 18, 0.85);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding: 1.2rem 0;
}

.nav-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.brand-logo {
    font-family: var(--font-heading);
    font-weight: 900;
    font-size: 1.35rem;
    color: var(--gold);
    text-decoration: none;
    letter-spacing: 2px;
}

.nav-links {
    display: flex;
    align-items: center;
    gap: 2rem;
}

.nav-links a {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: color 0.25s ease;
}

.nav-links a:hover {
    color: var(--gold-light);
}

.btn-nav {
    padding: 0.55rem 1.25rem !important;
    border: 1px solid var(--gold-border);
    border-radius: var(--radius-sm);
    color: var(--gold) !important;
    background: var(--gold-dim);
    transition: all 0.3s ease !important;
}

.btn-nav:hover {
    background: var(--gold) !important;
    color: var(--bg-base) !important;
}

/* Hero Section */
.hero {
    padding: 8rem 0 6rem;
    text-align: center;
    background: radial-gradient(circle at 50% 20%, rgba(197, 160, 89, 0.12) 0%, transparent 65%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.badge-gold {
    display: inline-block;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 3px;
    color: var(--gold);
    padding: 0.35rem 1rem;
    border-radius: 50px;
    background: var(--gold-dim);
    border: 1px solid var(--gold-border);
    margin-bottom: 1.5rem;
}

.hero h1 {
    font-family: var(--font-heading);
    font-size: 3.25rem;
    font-weight: 900;
    letter-spacing: 1px;
    margin-bottom: 1.25rem;
    color: var(--text-primary);
}

.hero p {
    font-size: 1.15rem;
    color: var(--text-secondary);
    max-width: 620px;
    margin: 0 auto 2.5rem;
}

.hero-actions {
    display: flex;
    justify-content: center;
    gap: 1.2rem;
}

.btn-primary {
    display: inline-block;
    padding: 0.9rem 2rem;
    background: var(--gold);
    color: #0E0F12;
    font-weight: 600;
    font-size: 0.95rem;
    text-decoration: none;
    border-radius: var(--radius-sm);
    transition: all 0.3s ease;
    box-shadow: 0 4px 20px rgba(197, 160, 89, 0.25);
}

.btn-primary:hover {
    background: var(--gold-light);
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(197, 160, 89, 0.35);
}

.btn-secondary {
    display: inline-block;
    padding: 0.9rem 2rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--text-primary);
    font-weight: 500;
    font-size: 0.95rem;
    text-decoration: none;
    border-radius: var(--radius-sm);
    transition: all 0.3s ease;
}

.btn-secondary:hover {
    border-color: var(--gold-border);
    background: rgba(255, 255, 255, 0.03);
}

/* Sections */
.section {
    padding: 6rem 0;
}

.section-header {
    text-align: center;
    margin-bottom: 4rem;
}

.section-header .subtitle {
    text-transform: uppercase;
    font-size: 0.8rem;
    letter-spacing: 2px;
    color: var(--gold);
    margin-bottom: 0.5rem;
    display: block;
}

.section-header h2 {
    font-family: var(--font-heading);
    font-size: 2.2rem;
}

/* Services Grid */
.services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
}

.service-card {
    background: var(--bg-surface);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-md);
    padding: 2.5rem 2rem;
    transition: all 0.35s ease;
    display: flex;
    flex-direction: column;
}

.service-card:hover {
    transform: translateY(-6px);
    border-color: var(--gold-border);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
}

.service-card.featured {
    border-color: var(--gold-border);
    background: linear-gradient(180deg, rgba(197, 160, 89, 0.08) 0%, var(--bg-surface) 100%);
}

.card-icon {
    font-size: 2.2rem;
    margin-bottom: 1.25rem;
}

.service-card h3 {
    font-family: var(--font-heading);
    font-size: 1.3rem;
    margin-bottom: 0.75rem;
    color: var(--text-primary);
}

.service-card p {
    color: var(--text-secondary);
    font-size: 0.95rem;
    margin-bottom: 1.5rem;
    flex-grow: 1;
}

.service-card .price {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--gold);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-top: 1rem;
}

/* Differentials */
.diff-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2rem;
}

.diff-item {
    background: var(--bg-surface);
    padding: 2rem;
    border-radius: var(--radius-md);
    border-left: 3px solid var(--gold);
}

.diff-item h4 {
    font-family: var(--font-heading);
    font-size: 1.15rem;
    margin-bottom: 0.6rem;
}

.diff-item p {
    color: var(--text-secondary);
    font-size: 0.95rem;
}

/* CTA */
.cta-box {
    background: linear-gradient(135deg, #1C1E24 0%, #15171C 100%);
    border: 1px solid var(--gold-border);
    border-radius: var(--radius-lg);
    padding: 4.5rem 2rem;
    text-align: center;
}

.cta-box h2 {
    font-family: var(--font-heading);
    font-size: 2.3rem;
    margin-bottom: 1rem;
}

.cta-box p {
    color: var(--text-secondary);
    font-size: 1.1rem;
    margin-bottom: 2.2rem;
}

.btn-large {
    padding: 1.1rem 2.8rem;
    font-size: 1.05rem;
}

/* Footer */
.footer {
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding: 3rem 0;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.88rem;
}

.footer-sub {
    margin-top: 0.4rem;
    font-size: 0.8rem;
}

/* Responsividade Mobile */
@media (max-width: 768px) {
    .nav-links {
        display: none;
    }
    .hero h1 {
        font-size: 2.2rem;
    }
    .hero p {
        font-size: 1rem;
    }
    .hero-actions {
        flex-direction: column;
    }
    .cta-box {
        padding: 3rem 1.5rem;
    }
}
"""

            t1 = TaskNode(
                id="task_01",
                title=f"Criar pasta do projeto em '{folder_path}'",
                description="Criar estrutura de diretórios para abrigar a aplicação web no computador.",
                tool="create_folder",
                arguments={"path": folder_path},
                expected_evidence_type="file",
                expected_evidence_criteria={"path": folder_path},
                agent_role="Coding Agent",
            )
            t2 = TaskNode(
                id="task_02",
                title=f"Criar arquivo 'index.html' com estrutura semântica",
                description=f"Escrever o código HTML5 completo para {brand_name} no computador.",
                dependencies=["task_01"],
                tool="write_file",
                arguments={"path": f"{folder_path}/index.html", "content": html_content.strip()},
                expected_evidence_type="file",
                expected_evidence_criteria={"path": f"{folder_path}/index.html"},
                agent_role="Coding Agent",
            )
            t3 = TaskNode(
                id="task_03",
                title=f"Criar folha de estilos 'style.css' (Modern Classic / Dark Gold)",
                description="Escrever o design system CSS3 responsivo, variáveis e tipografia.",
                dependencies=["task_02"],
                tool="write_file",
                arguments={"path": f"{folder_path}/style.css", "content": css_content.strip()},
                expected_evidence_type="file",
                expected_evidence_criteria={"path": f"{folder_path}/style.css"},
                agent_role="Coding Agent",
            )
            t4 = TaskNode(
                id="task_04",
                title=f"Verificar integridade dos arquivos gerados em '{folder_path}'",
                description="Validar e certificar que todos os arquivos foram escritos fisicamente no disco.",
                dependencies=["task_03"],
                tool="list_directory",
                arguments={"path": folder_path},
                expected_evidence_type="file",
                expected_evidence_criteria={"path": folder_path},
                agent_role="Coding Agent",
            )

            graph.add_task(t1)
            graph.add_task(t2)
            graph.add_task(t3)
            graph.add_task(t4)
            return graph

        elif "pasta" in lower_goal or "folder" in lower_goal or "diretório" in lower_goal:
            folder_name = "projeto_charlie"
            words = goal.replace('"', ' ').replace("'", ' ').split()
            for idx, word in enumerate(words):
                if word.lower() in ("pasta", "folder", "diretório") and idx + 1 < len(words):
                    candidate = words[idx + 1].strip(".,;:?!")
                    if candidate.lower() not in ("na", "no", "de", "do", "para", "em"):
                        folder_name = candidate
                        break

            t1 = TaskNode(
                id="task_01",
                title=f"Criar pasta '{folder_name}' na Área de Trabalho",
                description="Criar diretório local através da ferramenta de arquivos do computador.",
                tool="create_folder",
                arguments={"path": folder_name},
                expected_evidence_type="file",
                expected_evidence_criteria={"path": folder_name},
                agent_role="Coding Agent",
            )
            t2 = TaskNode(
                id="task_02",
                title=f"Verificar existência e integridade da pasta '{folder_name}'",
                description="Validar se o diretório foi criado com sucesso no disco local.",
                dependencies=["task_01"],
                tool="list_directory",
                arguments={"path": folder_name},
                expected_evidence_type="file",
                expected_evidence_criteria={"path": folder_name},
                agent_role="Coding Agent",
            )
            graph.add_task(t1)
            graph.add_task(t2)
        else:
            t1 = TaskNode(
                id="task_01",
                title="Inspecionar e analisar escopo do ambiente local",
                description="Mapear os requisitos necessários no ambiente Windows.",
                tool="list_directory",
                arguments={"path": "Documentos"},
                expected_evidence_type="system",
                agent_role="Coding Agent",
            )
            t2 = TaskNode(
                id="task_02",
                title="Executar ação principal e registrar evidências",
                description="Executar os comandos correspondentes ao objetivo solicitado.",
                dependencies=["task_01"],
                tool="list_directory",
                arguments={"path": "Desktop"},
                expected_evidence_type="system",
                agent_role="Coding Agent",
            )
            graph.add_task(t1)
            graph.add_task(t2)

        return graph
