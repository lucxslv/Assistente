export type { AssistantWidget, MessageRole, MessageStatus, ChatMessage } from './chat';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface Thread {
  id: string;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ApiMessage {
  id: string;
  type: 'user_message' | 'assistant_message';
  content: string;
  createdAt: string | null;
}

export interface StreamEvent {
  type:
    | 'token'
    | 'done'
    | 'error'
    | 'state'
    | 'tool_start'
    | 'tool_end'
    | 'status'
    | 'reset_and_fallback'
    | 'client_tool_request';
  data?: {
    token?: string;
    reply?: string;
    error?: string;
    name?: string;
    fallback_model?: string;
    reason?: string;
    [key: string]: unknown;
  };
}

export interface SystemStatus {
  assistant_name: string;
  is_online: boolean;
  status: 'idle' | 'thinking' | 'executing_tool' | 'speaking' | 'error' | string;
  is_speaking: boolean;
  is_listening: boolean;
  active_tool: string | null;
  current_process: string | null;
  uptime_seconds: number;
  database_connected: boolean;
  connected_devices_count: number;
  host: { cpu_percent: number; memory_percent: number; memory_used_mb: number; memory_total_mb: number };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentSession {
  id?: string;
  goal?: string;
  status?: string;
  nodes?: { id: string; title?: string; description?: string; status: string; tool?: string }[];
}

export interface AgentEvent {
  type: string;
  data: Record<string, unknown>;
}
