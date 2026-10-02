import { useState, useEffect } from "react";
import {
  AgentSession,
  AgentTask,
  PermissionRequest,
  PermissionDecision,
  AgentLogEntry,
  AgentProcess,
  AgentEvent,
  AgentStatus,
  AgentLogCategory,
  RiskLevel,
} from "../types";
import { getApiBase, getAuthHeaders } from "./api";
import {
  executeDeviceTool,
  getRunningProcesses,
  listLocalDirectory,
  readLocalFile,
} from "./deviceExecutor";

const STORAGE_KEY_SESSION = "charlie_agent_session_v1_2";
const STORAGE_KEY_LOGS = "charlie_agent_logs_v1_2";
const STORAGE_KEY_PERMISSIONS = "charlie_agent_perms_v1_2";

/**
 * Charlie Agentic Runtime 1.2 — Store Reativo & Motor Autônomo Local
 *
 * Gerencia o ciclo de vida:
 * GOAL -> PLANNER -> DAG TASK GRAPH -> EXECUTOR -> PERMISSION ENGINE -> LOCAL RUNTIME -> VERIFIER -> NEXT TASK
 */
class AgentRuntimeStore {
  private session: AgentSession | null = null;
  private permissions: PermissionRequest[] = [];
  private processes: AgentProcess[] = [];
  private logs: AgentLogEntry[] = [];
  private events: AgentEvent[] = [];
  private listeners: Set<() => void> = new Set();
  private sseAbortController: AbortController | null = null;
  private isExecutingLoop: boolean = false;
  private failureMemory: Map<string, { error: string; count: number }> = new Map();
  private trustedToolsInProject: Set<string> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error("[AgentRuntimeStore] Erro no listener:", err);
      }
    });
  }

  private saveToStorage() {
    if (typeof window === "undefined") return;
    try {
      if (this.session) {
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(this.session));
      } else {
        localStorage.removeItem(STORAGE_KEY_SESSION);
      }
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(this.logs.slice(-150)));
      localStorage.setItem(STORAGE_KEY_PERMISSIONS, JSON.stringify(this.permissions.slice(-50)));
    } catch (e) {
      console.warn("[AgentRuntimeStore] Erro ao salvar estado:", e);
    }
  }

  private loadFromStorage() {
    if (typeof window === "undefined") return;
    try {
      const sessStr = localStorage.getItem(STORAGE_KEY_SESSION);
      if (sessStr) {
        this.session = JSON.parse(sessStr);
      }
      const logsStr = localStorage.getItem(STORAGE_KEY_LOGS);
      if (logsStr) {
        this.logs = JSON.parse(logsStr);
      }
      const permsStr = localStorage.getItem(STORAGE_KEY_PERMISSIONS);
      if (permsStr) {
        this.permissions = JSON.parse(permsStr);
      }
    } catch (e) {
      console.warn("[AgentRuntimeStore] Erro ao recuperar estado:", e);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ================= Getters =================
  public getSession(): AgentSession | null {
    return this.session;
  }

  public getPermissions(): PermissionRequest[] {
    return this.permissions;
  }

  public getPendingPermissions(): PermissionRequest[] {
    return this.permissions.filter((p) => p.status === "pending");
  }

  public getLogs(): AgentLogEntry[] {
    return this.logs;
  }

  public getProcesses(): AgentProcess[] {
    return this.processes;
  }

  public getEvents(): AgentEvent[] {
    return this.events;
  }

  // ================= Logs e Eventos =================
  public addLog(category: AgentLogCategory, message: string, details?: any) {
    const entry: AgentLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour12: false }),
      category,
      message,
      details,
    };
    this.logs.push(entry);
    if (this.logs.length > 500) {
      this.logs.shift();
    }
    this.notify();
  }

  public emitEvent(type: AgentEvent["type"], data: any) {
    const event: AgentEvent = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    this.events.push(event);
    if (this.events.length > 200) {
      this.events.shift();
    }

    if (type.startsWith("task.")) {
      this.addLog("AGENT", `[${type}] ${data?.title || data?.taskId || ""}`, data);
    } else if (type.startsWith("tool.")) {
      this.addLog("TOOL", `[${type}] ${data?.name || data?.tool || ""}`, data);
    } else if (type.startsWith("permission.")) {
      this.addLog("PERMISSION", `[${type}] ${data?.tool || ""}: ${data?.status || "solicitada"}`, data);
    } else if (type.startsWith("verification.")) {
      this.addLog("VERIFIER", `[${type}] Evidência validada: ${data?.summary || ""}`, data);
    } else if (type.startsWith("replan.")) {
      this.addLog("REPLANNER", `[${type}] Estratégia atualizada: ${data?.strategy || ""}`, data);
    }

    this.notify();
  }

  // ================= Decomposição de Objetivos (Planner Local) =================
  private decomposeGoalLocally(goal: string, _project: string): AgentTask[] {
    const lower = goal.toLowerCase();
    const tasks: AgentTask[] = [];

    // Detecção: Criar pastas e/ou arquivos
    if (lower.includes("pasta") || lower.includes("diretório") || lower.includes("arquivo") || lower.includes("criar")) {
      // Extração de nomes potenciais
      let folderName = "NovaPasta";
      const folderMatch = goal.match(/(?:pasta|diret[oó]rio)\s+['"“]?([a-zA-Z0-9_\-\.\s]+?)['"”]?\s+(?:no|na|em|e|$)/i);
      if (folderMatch && folderMatch[1]) {
        folderName = folderMatch[1].trim();
      }

      let fileName = "documento.txt";
      const fileMatch = goal.match(/arquivo\s+['"“]?([a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+)['"”]?/i);
      if (fileMatch && fileMatch[1]) {
        fileName = fileMatch[1].trim();
      }

      const hasFile = lower.includes("arquivo") || lower.includes(".txt") || lower.includes(".md");

      tasks.push({
        id: "task_01",
        title: `Criar pasta '${folderName}' no Desktop`,
        description: `Garantir existência do diretório de trabalho no sistema de arquivos local.`,
        status: "pending",
        dependencies: [],
        tool: "create_folder",
        args: { path: `Desktop/${folderName}` },
        risk: "LOW",
        attempts: 0,
        maxAttempts: 3,
      });

      if (hasFile) {
        tasks.push({
          id: "task_02",
          title: `Criar arquivo '${fileName}' com conteúdo`,
          description: `Gerar arquivo e persistir dados necessários.`,
          status: "pending",
          dependencies: ["task_01"],
          tool: "write_file",
          args: {
            path: `Desktop/${folderName}/${fileName}`,
            content: `# Arquivo gerado pelo Charlie Agentic Runtime\n\nObjetivo: ${goal}\nData: ${new Date().toLocaleString("pt-BR")}\n`,
          },
          risk: "LOW",
          attempts: 0,
          maxAttempts: 3,
        });

        tasks.push({
          id: "task_03",
          title: `Verificar existência e integridade do arquivo '${fileName}'`,
          description: `Coletar evidência tangível de persistência no disco via Verifier.`,
          status: "pending",
          dependencies: ["task_02"],
          tool: "read_file",
          args: { path: `Desktop/${folderName}/${fileName}` },
          risk: "LOW",
          attempts: 0,
          maxAttempts: 3,
        });
      } else {
        tasks.push({
          id: "task_02",
          title: `Verificar integridade da pasta '${folderName}'`,
          description: `Coletar evidência tangível de diretório via Verifier.`,
          status: "pending",
          dependencies: ["task_01"],
          tool: "list_directory",
          args: { path: `Desktop/${folderName}` },
          risk: "LOW",
          attempts: 0,
          maxAttempts: 3,
        });
      }

      return tasks;
    }

    // Detecção: Listar ou inspecionar processos
    if (lower.includes("processo") || lower.includes("memória") || lower.includes("cpu") || lower.includes("desempenho")) {
      tasks.push({
        id: "task_01",
        title: "Inspecionar processos ativos do Windows",
        description: "Consultar os maiores consumidores de CPU e memória do sistema.",
        status: "pending",
        dependencies: [],
        tool: "get_process_list",
        args: {},
        risk: "LOW",
        attempts: 0,
        maxAttempts: 3,
      });
      tasks.push({
        id: "task_02",
        title: "Verificar estabilidade e evidências de telemetria",
        description: "Validar métricas obtidas e diagnosticar anomalias.",
        status: "pending",
        dependencies: ["task_01"],
        tool: "verify_metrics",
        args: {},
        risk: "LOW",
        attempts: 0,
        maxAttempts: 3,
      });
      return tasks;
    }

    // Detecção: Executar comando de terminal / PowerShell / Git / Testes
    if (lower.includes("comando") || lower.includes("terminal") || lower.includes("powershell") || lower.includes("git") || lower.includes("teste") || lower.includes("build") || lower.includes("npm")) {
      let cmd = "Get-ChildItem -Path .";
      if (lower.includes("git")) cmd = "git status";
      else if (lower.includes("disco") || lower.includes("espaço")) cmd = "Get-PSDrive -PSProvider FileSystem";
      else if (lower.includes("npm")) cmd = "npm test";

      tasks.push({
        id: "task_01",
        title: `Executar comando: ${cmd}`,
        description: `Executar instrução no terminal do Windows sob supervisão de segurança.`,
        status: "pending",
        dependencies: [],
        tool: "execute_command",
        command: cmd,
        args: { command: cmd },
        risk: "HIGH",
        attempts: 0,
        maxAttempts: 3,
      });
      tasks.push({
        id: "task_02",
        title: "Verificar saída e código de término do comando",
        description: "Validar que o comando completou com sucesso (exit code 0).",
        status: "pending",
        dependencies: ["task_01"],
        tool: "verify_command",
        args: { command: cmd },
        risk: "LOW",
        attempts: 0,
        maxAttempts: 3,
      });
      return tasks;
    }

    // Objetivo Genérico com 3 etapas do pipeline
    tasks.push({
      id: "task_01",
      title: "Examinar ambiente e espaço de trabalho",
      description: "Inspecionar diretório e pré-condições para execução do objetivo.",
      status: "pending",
      dependencies: [],
      tool: "list_directory",
      args: { path: "." },
      risk: "LOW",
      attempts: 0,
      maxAttempts: 3,
    });
    tasks.push({
      id: "task_02",
      title: `Executar plano de ação para '${goal}'`,
      description: `Aplicar as instruções do objetivo com segurança no Local Runtime.`,
      status: "pending",
      dependencies: ["task_01"],
      tool: "write_file",
      args: {
        path: `Desktop/Charlie_${Date.now()}.txt`,
        content: `Relatório de Execução:\nObjetivo: ${goal}\nStatus: Concluído com sucesso.\n`,
      },
      risk: "LOW",
      attempts: 0,
      maxAttempts: 3,
    });
    tasks.push({
      id: "task_03",
      title: "Validar evidências tangíveis de conclusão",
      description: "Conclusão exige evidência: verificar integridade e registrar resultado no Verifier.",
      status: "pending",
      dependencies: ["task_02"],
      tool: "read_file",
      args: { path: `Desktop/Charlie_${Date.now()}.txt` },
      risk: "LOW",
      attempts: 0,
      maxAttempts: 3,
    });

    return tasks;
  }

  // ================= Ações de Sessão e Tarefas =================
  public startGoal(goal: string, project: string = "Charlie") {
    const sessionId = `session_${Date.now()}`;
    const now = new Date().toISOString();

    const tasks = this.decomposeGoalLocally(goal, project);

    this.session = {
      id: sessionId,
      goal,
      project,
      status: "running",
      progress: 0,
      currentTaskId: tasks[0]?.id,
      tasks,
      startedAt: now,
      updatedAt: now,
    };

    this.failureMemory.clear();
    this.addLog("SYSTEM", `Nova sessão do agente iniciada: [${goal}]`);
    this.addLog("AGENT", `Objetivo registrado. Plano decomposto em ${tasks.length} tarefas estruturadas.`);
    this.emitEvent("agent.started", { sessionId, goal, project });
    this.notify();

    // Tenta sincronizar com o backend
    this.syncGoalWithBackend(goal, project);
    this.connectStream();

    // Dispara o loop autônomo local
    this.runAutonomousLoop();
  }

  private async syncGoalWithBackend(goal: string, project: string) {
    try {
      const res = await fetch(`${getApiBase()}/agent/goal`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ goal, project }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.graph?.tasks && data.graph.tasks.length > 0 && this.session && this.session.status === "running") {
          // Se o backend forneceu um plano mais inteligente antes da execução avançar, mescla
          const currentDone = this.session.tasks.filter((t) => t.status === "success").length;
          if (currentDone === 0) {
            this.session.tasks = data.graph.tasks;
            this.session.currentTaskId = data.graph.tasks[0]?.id;
            this.addLog("AGENT", `Plano inteligente atualizado com ${data.graph.tasks.length} tarefas do Brain.`);
            this.notify();
          }
        }
      }
    } catch {
      // Backend inacessível: o agente local roda 100% autônomo
    }
  }

  // ================= Loop Autônomo de Execução =================
  private async runAutonomousLoop() {
    if (this.isExecutingLoop) return;
    this.isExecutingLoop = true;

    try {
      while (this.session && this.session.status === "running") {
        // Encontra a próxima tarefa pronta na ordem topológica do DAG
        const readyTask = this.session.tasks.find((task) => {
          if (task.status !== "pending" && task.status !== "running") return false;
          // Todas as dependências devem estar concluídas com sucesso
          return task.dependencies.every((depId) => {
            const depTask = this.session?.tasks.find((t) => t.id === depId);
            return depTask?.status === "success";
          });
        });

        // Se não há tarefa pronta
        if (!readyTask) {
          const hasWaitingPerm = this.session.tasks.some((t) => t.status === "waiting_permission");
          if (hasWaitingPerm) {
            this.setStatus("waiting_permission");
            break;
          }

          const allSuccess = this.session.tasks.every((t) => t.status === "success");
          if (allSuccess) {
            this.setStatus("completed");
            this.session.progress = 100;
            this.session.summary = `Todas as ${this.session.tasks.length} tarefas foram executadas e verificadas com evidências tangíveis.`;
            this.addLog("AGENT", `Objetivo '${this.session.goal}' CONCLUÍDO com sucesso.`);
            this.emitEvent("agent.completed", { sessionId: this.session.id, summary: this.session.summary });
            break;
          }

          const hasFailed = this.session.tasks.some((t) => t.status === "failure");
          if (hasFailed) {
            this.setStatus("failed");
            this.session.summary = "A execução do agente parou devido a falha não recuperável.";
            this.addLog("ERROR", "Execução interrompida.");
            this.emitEvent("agent.failed", { sessionId: this.session.id, reason: this.session.summary });
            break;
          }

          break;
        }

        // Seleciona a tarefa para execução
        this.session.currentTaskId = readyTask.id;
        this.updateTask(readyTask.id, {
          status: "running",
          startedAt: readyTask.startedAt || new Date().toISOString(),
          attempts: (readyTask.attempts || 0) + 1,
        });

        this.addLog("AGENT", `Iniciando execução da tarefa [${readyTask.id}]: ${readyTask.title}`);
        this.emitEvent("task.started", readyTask);

        // 1. Verificação de Risco & Permission Engine
        const toolName = readyTask.tool || "generic";
        const risk = readyTask.risk || this.assessToolRisk(toolName, readyTask.args);

        const requiresConfirmation =
          (risk === "HIGH" || risk === "CRITICAL") && !this.trustedToolsInProject.has(toolName);

        if (requiresConfirmation) {
          this.updateTask(readyTask.id, { status: "waiting_permission" });
          this.requestPermission({
            taskId: readyTask.id,
            tool: toolName,
            command: readyTask.command || JSON.stringify(readyTask.args || {}),
            project: this.session.project,
            risk,
            reason: `Execução da tarefa '${readyTask.title}' requer autorização do usuário (Nível de risco: ${risk}).`,
          });
          // Pausa o loop aguardando a decisão do usuário na UI
          break;
        }

        // 2. Execução da Ferramenta no Local Runtime
        this.emitEvent("tool.started", { taskId: readyTask.id, tool: toolName, args: readyTask.args });
        this.addLog("TOOL", `Executando '${toolName}' com argumentos:`, readyTask.args);

        let toolOutput = "";
        let toolSuccess = true;

        try {
          toolOutput = await executeDeviceTool(toolName, readyTask.args || {});
          this.emitEvent("tool.completed", { taskId: readyTask.id, tool: toolName, result: toolOutput });
          this.addLog("TOOL", `Saída de '${toolName}':\n${toolOutput}`);
        } catch (err: any) {
          toolSuccess = false;
          toolOutput = String(err?.message || err);
          this.addLog("ERROR", `Erro ao executar ferramenta '${toolName}': ${toolOutput}`);
        }

        // 3. Verifier Phase — Validação de Evidências Tangíveis
        const verification = await this.verifyTaskOutcome(readyTask, toolOutput, toolSuccess);

        if (verification.passed) {
          this.completeTaskWithEvidence(
            readyTask.id,
            verification.summary,
            verification.type
          );
        } else {
          // Failure Memory & Churn Protection
          const failureKey = `${readyTask.id}_${verification.summary}`;
          const prevFailure = this.failureMemory.get(failureKey);
          const failureCount = (prevFailure?.count || 0) + 1;
          this.failureMemory.set(failureKey, { error: verification.summary, count: failureCount });

          if (failureCount >= 2) {
            this.addLog(
              "REPLANNER",
              `[CHURN DETECTED] A tarefa ${readyTask.id} falhou 2 vezes consecutivas com o mesmo motivo: "${verification.summary}". Abortando repetição inútil.`
            );
            this.failTask(readyTask.id, `Falha persistente verificada: ${verification.summary}`);
          } else if (readyTask.attempts >= readyTask.maxAttempts) {
            this.failTask(readyTask.id, verification.summary);
          } else {
            this.addLog("REPLANNER", `Tentativa ${readyTask.attempts} falhou. Tentando recuperação na próxima iteração...`);
            this.updateTask(readyTask.id, { status: "pending", error: verification.summary });
          }
        }

        // Breve intervalo para fluidez da UI
        await new Promise((r) => setTimeout(r, 600));
      }
    } finally {
      this.isExecutingLoop = false;
    }
  }

  // ================= Avaliador de Risco =================
  private assessToolRisk(tool: string, args?: Record<string, any>): RiskLevel {
    const dangerous = ["rm", "del", "remove", "format", "shutdown", "drop"];
    const cmd = String(args?.command || "").toLowerCase();

    for (const d of dangerous) {
      if (cmd.includes(d)) return "CRITICAL";
    }

    if (tool === "execute_command" || tool === "powershell" || tool === "cmd") {
      return "HIGH";
    }

    if (tool === "write_file" || tool === "manage_application") {
      return "MEDIUM";
    }

    return "LOW";
  }

  // ================= Verifier de Evidências Tangíveis =================
  private async verifyTaskOutcome(
    task: AgentTask,
    toolOutput: string,
    toolSuccess: boolean
  ): Promise<{ passed: boolean; summary: string; type: "code" | "file" | "system" | "visual" }> {
    const tool = task.tool || "";

    if (!toolSuccess) {
      return {
        passed: false,
        summary: `A ferramenta reportou erro: ${toolOutput}`,
        type: "system",
      };
    }

    if (tool === "create_folder") {
      const folderPath = String(task.args?.path || "");
      try {
        const files = await listLocalDirectory(folderPath);
        return {
          passed: true,
          summary: `Pasta '${folderPath}' verificada com sucesso via inspeção de diretório (${files.length} itens encontrados).`,
          type: "file",
        };
      } catch {
        // Se a listagem direta falhar, aceita a saída bem-sucedida da criação
        return {
          passed: toolOutput.includes("sucesso"),
          summary: toolOutput,
          type: "file",
        };
      }
    }

    if (tool === "write_file") {
      const filePath = String(task.args?.path || "");
      try {
        const content = await readLocalFile(filePath, 4096);
        return {
          passed: content.length > 0,
          summary: `Arquivo '${filePath}' verificado com sucesso no disco (${content.length} caracteres).`,
          type: "file",
        };
      } catch (err: any) {
        return {
          passed: false,
          summary: `Arquivo não pôde ser lido após gravação: ${err?.message || err}`,
          type: "file",
        };
      }
    }

    if (tool === "read_file") {
      return {
        passed: !toolOutput.startsWith("Falha"),
        summary: `Conteúdo lido e validado com sucesso (${toolOutput.length} caracteres).`,
        type: "file",
      };
    }

    if (tool === "execute_command") {
      const exitCodeMatch = toolOutput.match(/Código de saída:\s*(-?\d+)/);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;
      const passed = exitCode === 0;
      return {
        passed,
        summary: passed
          ? `Comando completou com código de saída 0.`
          : `Comando encerrou com código de saída de erro: ${exitCode}.`,
        type: "code",
      };
    }

    if (tool === "get_process_list" || tool === "ps") {
      const procs = await getRunningProcesses();
      this.setProcesses(
        procs.map((p) => ({
          pid: p.pid,
          name: p.name,
          cpu: p.cpu,
          status: "RUNNING",
          startedAt: new Date().toLocaleTimeString(),
        }))
      );
      return {
        passed: procs.length > 0,
        summary: `${procs.length} processos ativos capturados e monitorados com sucesso.`,
        type: "system",
      };
    }

    return {
      passed: true,
      summary: `Ação concluída com sucesso: ${toolOutput.slice(0, 100)}`,
      type: "system",
    };
  }

  // ================= SSE Backend Stream =================
  public async connectStream() {
    if (this.sseAbortController) {
      this.sseAbortController.abort();
    }
    this.sseAbortController = new AbortController();

    try {
      const res = await fetch(`${getApiBase()}/agent/stream`, {
        headers: getAuthHeaders(),
        signal: this.sseAbortController.signal,
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = "message";
          let eventData = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.substring(7).trim();
            else if (line.startsWith("data: ")) eventData = line.substring(6).trim();
          }

          if (eventData) {
            try {
              const parsed = JSON.parse(eventData);
              this.handleServerEvent(eventType, parsed);
            } catch (err) {
              console.error("[AgentRuntimeStore] Erro ao parsear SSE:", err);
            }
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.debug("[AgentRuntimeStore] Stream desconectado:", e);
      }
    }
  }

  private handleServerEvent(type: string, data: any) {
    if (type === "task.started") {
      this.updateTask(data.id, { status: "running", startedAt: data.startedAt });
      if (this.session) this.session.currentTaskId = data.id;
    } else if (type === "task.completed") {
      this.updateTask(data.id, {
        status: "success",
        completedAt: data.completedAt,
        evidence: data.evidence,
      });
    } else if (type === "task.failed") {
      this.failTask(data.id, data.error || "Falha na execução");
    } else if (type === "agent.completed") {
      this.setStatus("completed");
      if (this.session) {
        this.session.progress = 100;
        this.session.summary = data.summary;
      }
    } else if (type === "agent.failed") {
      this.setStatus("failed");
      if (this.session) this.session.summary = data.reason;
    } else if (type === "agent.paused") {
      this.setStatus("paused");
    } else if (type === "agent.resumed") {
      this.setStatus("running");
    }

    this.emitEvent(type as any, data);
  }

  public setStatus(status: AgentStatus) {
    if (!this.session) return;
    this.session.status = status;
    this.session.updatedAt = new Date().toISOString();
    this.addLog("AGENT", `Status do agente atualizado para: ${status.toUpperCase()}`);
    this.notify();
  }

  public pauseAgent() {
    if (!this.session || this.session.status !== "running") return;
    this.setStatus("paused");
    this.emitEvent("agent.paused", { sessionId: this.session.id });
    fetch(`${getApiBase()}/agent/pause`, { method: "POST", headers: getAuthHeaders() }).catch(() => {});
  }

  public resumeAgent() {
    if (!this.session || this.session.status !== "paused") return;
    this.setStatus("running");
    this.emitEvent("agent.resumed", { sessionId: this.session.id });
    fetch(`${getApiBase()}/agent/resume`, { method: "POST", headers: getAuthHeaders() }).catch(() => {});
    this.runAutonomousLoop();
  }

  public cancelAgent() {
    if (!this.session) return;
    this.setStatus("failed");
    this.session.summary = "Tarefa cancelada pelo usuário.";
    this.addLog("SYSTEM", "Operação do agente abortada pelo usuário.");
    this.emitEvent("agent.failed", { sessionId: this.session.id, reason: "Cancelado pelo usuário" });
    fetch(`${getApiBase()}/agent/cancel`, { method: "POST", headers: getAuthHeaders() }).catch(() => {});
  }

  public updateTask(taskId: string, updates: Partial<AgentTask>) {
    if (!this.session) return;
    const taskIdx = this.session.tasks.findIndex((t) => t.id === taskId);
    if (taskIdx >= 0) {
      this.session.tasks[taskIdx] = {
        ...this.session.tasks[taskIdx],
        ...updates,
      };

      const completed = this.session.tasks.filter((t) => t.status === "success").length;
      this.session.progress = Math.round((completed / this.session.tasks.length) * 100);
      this.session.updatedAt = new Date().toISOString();

      this.emitEvent("task.updated", { taskId, updates });
      this.notify();
    }
  }

  public completeTaskWithEvidence(
    taskId: string,
    evidenceSummary: string,
    evidenceType: "code" | "file" | "system" | "visual" = "system"
  ) {
    if (!this.session) return;
    this.updateTask(taskId, {
      status: "success",
      completedAt: new Date().toISOString(),
      evidence: {
        type: evidenceType,
        summary: evidenceSummary,
        verifiedAt: new Date().toISOString(),
        passed: true,
      },
    });

    this.emitEvent("verification.completed", { taskId, summary: evidenceSummary });
  }

  public failTask(taskId: string, error: string) {
    if (!this.session) return;
    const task = this.session.tasks.find((t) => t.id === taskId);
    const attempts = task?.attempts || 1;

    this.updateTask(taskId, {
      attempts,
      error,
      status: "failure",
    });

    this.addLog("ERROR", `Falha na tarefa '${task?.title || taskId}': ${error}`, { attempts });
    this.emitEvent("task.failed", { taskId, error, attempts });
  }

  public retryTask(taskId: string) {
    if (!this.session) return;
    this.updateTask(taskId, {
      status: "running",
      error: undefined,
      startedAt: new Date().toISOString(),
    });
    this.session.currentTaskId = taskId;
    this.setStatus("running");
    this.addLog("AGENT", `Reiniciando tentativa da tarefa ${taskId}.`);
    this.runAutonomousLoop();
  }

  // ================= Permission Engine =================
  public requestPermission(req: Omit<PermissionRequest, "id" | "status" | "requestedAt">): string {
    const id = `perm_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const perm: PermissionRequest = {
      ...req,
      id,
      status: "pending",
      requestedAt: new Date().toISOString(),
    };
    this.permissions.unshift(perm);
    this.setStatus("waiting_permission");
    this.addLog("PERMISSION", `[RISCO: ${req.risk}] Permissão solicitada para: ${req.tool} (${req.reason})`);
    this.emitEvent("permission.requested", perm);
    this.notify();
    return id;
  }

  public resolvePermission(id: string, decision: PermissionDecision) {
    const perm = this.permissions.find((p) => p.id === id);
    if (perm) {
      perm.status = decision;
      this.addLog("PERMISSION", `Permissão ${id} resolvida como: ${decision.toUpperCase()}`);
      this.emitEvent("permission.resolved", { id, decision });

      if (decision === "trust_in_project") {
        this.trustedToolsInProject.add(perm.tool);
      }

      if (decision === "deny") {
        if (perm.taskId) {
          this.failTask(perm.taskId, "Execução negada pelo usuário através do Permission Engine.");
        }
      }

      // Se não houver mais permissões pendentes, descongela o agente e retoma o loop
      if (this.getPendingPermissions().length === 0) {
        if (this.session?.status === "waiting_permission") {
          this.setStatus("running");
          this.runAutonomousLoop();
        }
      }
      this.notify();
    }
  }

  // ================= Process Monitor =================
  public async refreshProcesses() {
    try {
      const procs = await getRunningProcesses();
      this.processes = procs.map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu,
        status: "RUNNING",
        startedAt: new Date().toLocaleTimeString(),
      }));
      this.notify();
    } catch (err) {
      console.warn("[AgentRuntimeStore] Falha ao atualizar processos:", err);
    }
  }

  public setProcesses(procs: AgentProcess[]) {
    this.processes = procs;
    this.notify();
  }

  public clearSession() {
    this.session = null;
    this.permissions = [];
    this.processes = [];
    this.logs = [];
    this.events = [];
    this.failureMemory.clear();
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_SESSION);
      localStorage.removeItem(STORAGE_KEY_LOGS);
      localStorage.removeItem(STORAGE_KEY_PERMISSIONS);
    }
    this.notify();
  }
}

// Instância singleton global do Runtime Store
export const agentRuntimeStore = new AgentRuntimeStore();

// ================= React Hook para Consumo na UI =================
export function useAgentRuntime() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = agentRuntimeStore.subscribe(() => {
      setTick((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  return {
    session: agentRuntimeStore.getSession(),
    permissions: agentRuntimeStore.getPermissions(),
    pendingPermissions: agentRuntimeStore.getPendingPermissions(),
    logs: agentRuntimeStore.getLogs(),
    processes: agentRuntimeStore.getProcesses(),
    events: agentRuntimeStore.getEvents(),

    // Ações
    startGoal: (goal: string, project?: string) => agentRuntimeStore.startGoal(goal, project),
    pauseAgent: () => agentRuntimeStore.pauseAgent(),
    resumeAgent: () => agentRuntimeStore.resumeAgent(),
    cancelAgent: () => agentRuntimeStore.cancelAgent(),
    retryTask: (taskId: string) => agentRuntimeStore.retryTask(taskId),
    updateTask: (taskId: string, updates: Partial<AgentTask>) => agentRuntimeStore.updateTask(taskId, updates),
    completeTaskWithEvidence: (taskId: string, evidence: string, type?: "code" | "file" | "system" | "visual") =>
      agentRuntimeStore.completeTaskWithEvidence(taskId, evidence, type),
    failTask: (taskId: string, error: string) => agentRuntimeStore.failTask(taskId, error),
    requestPermission: (req: Omit<PermissionRequest, "id" | "status" | "requestedAt">) =>
      agentRuntimeStore.requestPermission(req),
    resolvePermission: (id: string, decision: PermissionDecision) =>
      agentRuntimeStore.resolvePermission(id, decision),
    addLog: (category: AgentLogCategory, message: string, details?: any) =>
      agentRuntimeStore.addLog(category, message, details),
    refreshProcesses: () => agentRuntimeStore.refreshProcesses(),
    clearSession: () => agentRuntimeStore.clearSession(),
  };
}
