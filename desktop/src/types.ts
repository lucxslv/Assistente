export interface Thread {
  id: string;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ToolCallInfo {
  name: string;
  args?: Record<string, any>;
  result?: any;
  status: "executing" | "completed" | "error";
}

export interface Message {
  id: string;
  name: string;
  type: "user_message" | "assistant_message";
  content: string;
  createdAt?: string | null;
  streaming?: boolean;
  tools?: ToolCallInfo[];
}

export interface StreamEvent {
  type: "token" | "tool_start" | "tool_end" | "status" | "done" | "error";
  data: any;
}

export interface Settings {
  assistant_name: string;
  llm_provider: string;
  gemini_model: string;
  groq_model: string;
  tts_voice: string;
  wake_word: string;
  wake_word_enabled: boolean;
  home_assistant_url: string;
  home_assistant_configured: boolean;
}

// ================= Charlie Agentic Runtime Types =================

export type AgentStatus =
  | "idle"
  | "planning"
  | "running"
  | "waiting_permission"
  | "verifying"
  | "paused"
  | "completed"
  | "failed";

export type AgentTaskStatus =
  | "pending"
  | "running"
  | "success"
  | "failure"
  | "waiting_permission"
  | "verifying"
  | "skipped";

export interface AgentTaskEvidence {
  type: "code" | "file" | "system" | "visual";
  summary: string;
  details?: string;
  verifiedAt: string;
  passed: boolean;
}

export interface AgentTask {
  id: string;
  title: string;
  description?: string;
  status: AgentTaskStatus;
  dependencies: string[];
  tool?: string;
  command?: string;
  attempts: number;
  maxAttempts: number;
  result?: string;
  evidence?: AgentTaskEvidence;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentSession {
  id: string;
  goal: string;
  project?: string;
  status: AgentStatus;
  progress: number; // 0 to 100
  currentTaskId?: string;
  tasks: AgentTask[];
  startedAt: string;
  updatedAt: string;
  summary?: string;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type PermissionDecision =
  | "allow_once"
  | "allow_for_task"
  | "trust_in_project"
  | "deny";

export interface PermissionRequest {
  id: string;
  taskId?: string;
  tool: string;
  command?: string;
  project?: string;
  risk: RiskLevel;
  reason: string;
  status: "pending" | PermissionDecision;
  requestedAt: string;
}

export type AgentLogCategory =
  | "SYSTEM"
  | "AGENT"
  | "TOOL"
  | "PERMISSION"
  | "VERIFIER"
  | "REPLANNER"
  | "ERROR";

export interface AgentLogEntry {
  id: string;
  timestamp: string;
  category: AgentLogCategory;
  message: string;
  details?: any;
}

export interface AgentProcess {
  pid: number;
  name: string;
  cpu: number;
  status: "RUNNING" | "TERMINATED" | "FAILED";
  startedAt: string;
}

export interface AgentEvent {
  type:
    | "agent.started"
    | "agent.paused"
    | "agent.resumed"
    | "agent.completed"
    | "agent.failed"
    | "task.created"
    | "task.started"
    | "task.updated"
    | "task.completed"
    | "task.failed"
    | "tool.started"
    | "tool.completed"
    | "tool.failed"
    | "permission.requested"
    | "permission.resolved"
    | "verification.started"
    | "verification.completed"
    | "replan.started"
    | "replan.completed";
  data: any;
  timestamp: string;
}
