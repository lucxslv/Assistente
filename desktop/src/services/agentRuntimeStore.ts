import {
  AgentSession,
  AgentTask,
  AgentStatus,
  PermissionRequest,
  PermissionDecision,
  AgentLogEntry,
  AgentLogCategory,
  AgentProcess,
  AgentEvent,
} from "../types";
import { useEffect, useState } from "react";
import { getApiBase, getAuthHeaders } from "./api";

// ================= Chaves de Persistência =================
const STORAGE_KEY_SESSION = "charlie_agent_active_session";
const STORAGE_KEY_LOGS = "charlie_agent_logs";
const STORAGE_KEY_PERMISSIONS = "charlie_agent_permissions";

// ================= Estado Central =================
class AgentRuntimeStore {
  private session: AgentSession | null = null;
  private permissions: PermissionRequest[] = [];
  private logs: AgentLogEntry[] = [];
  private processes: AgentProcess[] = [];
  private events: AgentEvent[] = [];
  private listeners: Set<() => void> = new Set();
  private sseAbortController: AbortController | null = null;

  constructor() {
    this.loadFromStorage();
  }

  // Carrega estado persistido anterior (tolerância a quedas/reinicialização)
  private loadFromStorage() {
    try {
      if (typeof window === "undefined") return;
      const savedSession = localStorage.getItem(STORAGE_KEY_SESSION);
      if (savedSession) {
        this.session = JSON.parse(savedSession);
      }
      const savedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
      if (savedLogs) {
        this.logs = JSON.parse(savedLogs);
      }
      const savedPerms = localStorage.getItem(STORAGE_KEY_PERMISSIONS);
      if (savedPerms) {
        this.permissions = JSON.parse(savedPerms);
      }
    } catch (e) {
      console.warn("[AgentRuntimeStore] Falha ao carregar estado do localStorage:", e);
    }
  }

  // Persiste estado no armazenamento local
  private persist() {
    try {
      if (typeof window === "undefined") return;
      if (this.session) {
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(this.session));
      } else {
        localStorage.removeItem(STORAGE_KEY_SESSION);
      }
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(this.logs.slice(-200)));
      localStorage.setItem(STORAGE_KEY_PERMISSIONS, JSON.stringify(this.permissions));
    } catch (e) {
      console.warn("[AgentRuntimeStore] Erro ao persistir estado:", e);
    }
  }

  private notify() {
    this.persist();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("[AgentRuntimeStore] Erro no listener:", err);
      }
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
    // Limite máximo de histórico em memória para performance
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

    // Registra log automaticamente com base no tipo de evento
    if (type.startsWith("task.")) {
      this.addLog("AGENT", `[${type}] ${data?.title || data?.taskId || ""}`, data);
    } else if (type.startsWith("tool.")) {
      this.addLog("TOOL", `[${type}] ${data?.name || data?.tool || ""}`, data);
    } else if (type.startsWith("permission.")) {
      this.addLog("PERMISSION", `[${type}] ${data?.tool || ""}: ${data?.status || "solicitada"}`, data);
    } else if (type.startsWith("verification.")) {
      this.addLog("VERIFIER", `[${type}] Evidência validada: ${data?.summary || ""}`, data);
    } else if (type.startsWith("replan.")) {
      this.addLog("REPLANNER", `[${type}] Novo plano gerado: ${data?.strategy || ""}`, data);
    }

    this.notify();
  }

  // ================= Ações de Sessão e Tarefas =================
  public startGoal(goal: string, project: string = "Charlie") {
    const sessionId = `session_${Date.now()}`;
    const now = new Date().toISOString();

    // Cria plano inicial decomposto
    const initialTasks: AgentTask[] = [
      {
        id: "task_01",
        title: "Analisar ambiente e inspecionar contexto do projeto",
        description: "Examinar arquivos, dependências e escopo do objetivo.",
        status: "running",
        dependencies: [],
        tool: "file_explorer.list_directory",
        attempts: 1,
        maxAttempts: 3,
        startedAt: now,
      },
      {
        id: "task_02",
        title: "Definir estratégia e plano de ação estruturado",
        description: "Mapear as ações necessárias e prever pontos de validação.",
        status: "pending",
        dependencies: ["task_01"],
        attempts: 0,
        maxAttempts: 3,
      },
      {
        id: "task_03",
        title: "Executar modificações e comandos no sistema",
        description: "Aplicar as alterações com segurança através do Local Runtime.",
        status: "pending",
        dependencies: ["task_02"],
        attempts: 0,
        maxAttempts: 3,
      },
      {
        id: "task_04",
        title: "Verificar evidências tangíveis de sucesso",
        description: "Validar saída, testes e conformidade do resultado (Verifier).",
        status: "pending",
        dependencies: ["task_03"],
        attempts: 0,
        maxAttempts: 3,
      },
    ];

    this.session = {
      id: sessionId,
      goal,
      project,
      status: "running",
      progress: 10,
      currentTaskId: "task_01",
      tasks: initialTasks,
      startedAt: now,
      updatedAt: now,
    };

    this.addLog("SYSTEM", `Nova sessão do agente iniciada: [${goal}]`);
    this.addLog("AGENT", `Objetivo registrado. Iniciando decomposição de tarefas para o projeto '${project}'.`);
    this.emitEvent("agent.started", { sessionId, goal, project });
    this.notify();

    // Sincroniza assincronamente com o Backend se disponível
    this.syncGoalWithBackend(goal, project);
    this.connectStream();
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
        if (data.graph?.tasks && data.graph.tasks.length > 0 && this.session) {
          this.session.tasks = data.graph.tasks;
          this.session.currentTaskId = data.graph.tasks[0]?.id;
          this.addLog("AGENT", `Plano inteligente com ${data.graph.tasks.length} tarefas recebido do Brain.`);
          this.notify();
        }
      }
    } catch {
      // Executa perfeitamente no runtime local
    }
  }

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

      // Recalcula progresso geral
      const completed = this.session.tasks.filter((t) => t.status === "success").length;
      this.session.progress = Math.round((completed / this.session.tasks.length) * 100);
      this.session.updatedAt = new Date().toISOString();

      this.emitEvent("task.updated", { taskId, updates });
      this.notify();
    }
  }

  public completeTaskWithEvidence(taskId: string, evidenceSummary: string, evidenceType: "code" | "file" | "system" | "visual" = "system") {
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

    // Avança para a próxima tarefa pendente se houver
    const nextTask = this.session.tasks.find((t) => t.status === "pending");
    if (nextTask) {
      this.session.currentTaskId = nextTask.id;
      this.updateTask(nextTask.id, { status: "running", startedAt: new Date().toISOString() });
    } else {
      // Todas tarefas concluídas com evidências
      this.setStatus("completed");
      this.session.progress = 100;
      this.session.summary = "Objetivo concluído e verificado com sucesso.";
      this.emitEvent("agent.completed", { sessionId: this.session.id, summary: this.session.summary });
    }
  }

  public failTask(taskId: string, error: string) {
    if (!this.session) return;
    const task = this.session.tasks.find((t) => t.id === taskId);
    const attempts = (task?.attempts || 1) + 1;

    this.updateTask(taskId, {
      attempts,
      error,
      status: attempts >= (task?.maxAttempts || 3) ? "failure" : "pending",
    });

    this.addLog("ERROR", `Falha na tarefa '${task?.title || taskId}': ${error}`, { attempts });
    this.emitEvent("task.failed", { taskId, error, attempts });

    if (attempts >= (task?.maxAttempts || 3)) {
      this.addLog("REPLANNER", `Limite de tentativas atingido na tarefa ${taskId}. Replanejando estratégia...`);
      this.emitEvent("replan.started", { taskId, error });
    }
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

      // Se não houver mais permissões pendentes, descongela o agente
      if (this.getPendingPermissions().length === 0 && this.session?.status === "waiting_permission") {
        this.setStatus("running");
      }
      this.notify();
    }
  }

  // ================= Process Monitor =================
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
    clearSession: () => agentRuntimeStore.clearSession(),
  };
}
