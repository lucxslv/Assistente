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
  type:
    | "token"
    | "tool_start"
    | "tool_end"
    | "status"
    | "done"
    | "error"
    | "reset_and_fallback"
    | "client_tool_request"
    | "client_tool_call";
  data: any;
}

export interface Settings {
  assistant_name: string;
  llm_provider: string;
  gemini_model: string;
  groq_model: string;
  tts_provider?: string;
  tts_voice: string;
  elevenlabs_api_key?: string;
  elevenlabs_voice_id?: string;
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
  args?: Record<string, any>;
  risk?: RiskLevel;
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

// ==========================================
// Charlie Agent Workspace 1.0 Data Models
// ==========================================

export type ArtifactType =
  | "markdown"
  | "json"
  | "csv"
  | "txt"
  | "html"
  | "pdf"
  | "image"
  | "code"
  | "diff"
  | "diagram"
  | "report"
  | "patch";

export interface AgentArtifact {
  id: string;
  sessionId: string;
  name: string;
  type: ArtifactType;
  path?: string;
  content: string;
  sizeBytes?: number;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, any>;
  sections?: { title: string; content?: string }[];
}

export interface AgentTerminal {
  id: string;
  sessionId: string;
  name: string;
  shell: "powershell" | "cmd" | "bash";
  command: string;
  cwd?: string;
  output: string;
  exitCode?: number;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
}

export type AgentFileCategory =
  | "analyzed"
  | "created"
  | "modified"
  | "deleted"
  | "referenced"
  | "uploaded"
  | "generated";

export interface AgentFile {
  id: string;
  sessionId: string;
  path: string;
  name: string;
  category: AgentFileCategory;
  size?: number;
  extension?: string;
  lastModified?: string;
  taskId?: string;
  contentPreview?: string;
}

export type AgentChangeType = "M" | "A" | "D";
export type ChangeReviewStatus = "pending_review" | "approved" | "rejected" | "applied" | "reverted";

export interface AgentChange {
  id: string;
  sessionId: string;
  path: string;
  type: AgentChangeType;
  oldContent?: string;
  newContent?: string;
  diff?: string;
  status: ChangeReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  changeSetId?: string;
}

export interface AgentChangeSet {
  id: string;
  sessionId: string;
  title: string;
  goal?: string;
  changes: AgentChange[];
  status: ChangeReviewStatus;
  verifications: { name: string; passed: boolean; details?: string }[];
  createdAt: string;
}

export interface AgentBackgroundTask {
  id: string;
  sessionId: string;
  name: string;
  description?: string;
  progress: number;
  status: "running" | "completed" | "failed" | "permission_required" | "paused";
  startedAt: string;
  completedAt?: string;
  logs?: string[];
  permissionReqId?: string;
}

export interface AgentUpload {
  id: string;
  sessionId: string;
  filename: string;
  sizeBytes: number;
  type: string;
  source: "local" | "user" | "external";
  uploadedAt: string;
  usedByTaskId?: string;
  path?: string;
}

export interface AgentMedia {
  id: string;
  sessionId: string;
  name: string;
  type: "image" | "diagram" | "video" | "screenshot";
  url?: string;
  base64?: string;
  description?: string;
  createdAt: string;
}

export interface AgentSubagent {
  id: string;
  sessionId: string;
  role: "Planner" | "Coding Agent" | "Research Agent" | "Testing Agent" | "Reviewer" | string;
  goal: string;
  status: "running" | "completed" | "waiting" | "failed";
  currentTask?: string;
  toolsUsed: string[];
  artifacts: string[];
  result?: string;
  errors?: string[];
  startedAt: string;
  completedAt?: string;
}

export interface AgentEvidenceItem {
  id: string;
  sessionId: string;
  taskId?: string;
  title: string;
  type: "command" | "output" | "exit_code" | "file" | "test" | "screenshot" | "observation";
  command?: string;
  output?: string;
  exitCode?: number;
  filePath?: string;
  passed: boolean;
  timestamp: string;
  details?: string;
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
  // Agent Workspace 1.0 properties
  artifacts: AgentArtifact[];
  terminals: AgentTerminal[];
  files: AgentFile[];
  changes: AgentChange[];
  changeSets?: AgentChangeSet[];
  backgroundTasks: AgentBackgroundTask[];
  uploads: AgentUpload[];
  media: AgentMedia[];
  subagents: AgentSubagent[];
  evidence: AgentEvidenceItem[];
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
