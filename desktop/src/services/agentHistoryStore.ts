import { AgentSession } from "../types";
import { getApiBase, getAuthHeaders } from "./api";

const STORAGE_KEY_HISTORY = "charlie_agent_history_v1_2";

export interface AggregatedAgentMetrics {
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  successRate: number;
  totalTasks: number;
  completedTasks: number;
}

class AgentHistoryStore {
  private history: AgentSession[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[AgentHistoryStore] Erro no listener:", err);
      }
    });
  }

  private loadFromStorage() {
    if (typeof window === "undefined") return;
    try {
      const data = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (data) {
        this.history = JSON.parse(data);
      }
    } catch (e) {
      console.warn("[AgentHistoryStore] Erro ao carregar histórico local:", e);
    }
  }

  private saveToStorage() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(this.history.slice(0, 100)));
    } catch (e) {
      console.warn("[AgentHistoryStore] Erro ao salvar histórico local:", e);
    }
  }

  public getHistory(): AgentSession[] {
    return [...this.history];
  }

  public async saveSession(session: AgentSession) {
    if (!session || !session.id) return;

    // Remove versão anterior se existir e insere no topo
    this.history = this.history.filter((s) => s.id !== session.id);
    this.history.unshift({ ...session });

    // Limite máximo de histórico local
    if (this.history.length > 100) {
      this.history.pop();
    }

    this.notify();

    // Sincroniza assincronamente com o Backend SQLite
    try {
      fetch(`${getApiBase()}/agent/sessions`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ session }),
      }).catch(() => {});
    } catch {
      // Ignora falhas de rede com o servidor
    }
  }

  public async deleteSession(sessionId: string) {
    this.history = this.history.filter((s) => s.id !== sessionId);
    this.notify();

    try {
      fetch(`${getApiBase()}/agent/sessions/${sessionId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      }).catch(() => {});
    } catch {
      // Ignora falhas de rede
    }
  }

  public clearHistory() {
    this.history = [];
    this.notify();
  }

  public getMetrics(): AggregatedAgentMetrics {
    const total = this.history.length;
    const completed = this.history.filter((s) => s.status === "completed").length;
    const failed = this.history.filter((s) => s.status === "failed").length;

    let totalTasks = 0;
    let completedTasks = 0;

    for (const s of this.history) {
      if (s.tasks) {
        totalTasks += s.tasks.length;
        completedTasks += s.tasks.filter((t) => t.status === "success").length;
      }
    }

    const successRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      totalSessions: total,
      completedSessions: completed,
      failedSessions: failed,
      successRate: Math.round(successRate * 10) / 10,
      totalTasks,
      completedTasks,
    };
  }
}

export const agentHistoryStore = new AgentHistoryStore();
