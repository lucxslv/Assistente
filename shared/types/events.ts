/**
 * Contrato Canônico de Eventos de Streaming do Charlie (SSE e WebSockets).
 * Compartilhado entre Backend, Web Chat, Desktop e Mobile.
 */

export type StreamEventType =
  | 'token'
  | 'tool_start'
  | 'tool_end'
  | 'status'
  | 'done'
  | 'error'
  | 'reset_and_fallback'
  | 'client_tool_request'
  | 'client_tool_call'
  | 'state'
  | 'ping'
  | 'pong';

export interface ToolCallInfo {
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  status?: 'executing' | 'completed' | 'failed';
  call_id?: string;
  scope?: 'cloud' | 'device' | 'desktop' | string;
}

export interface StreamEventData {
  token?: string;
  reply?: string;
  error?: string;
  status?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  call_id?: string;
  scope?: string;
  fallback_model?: string;
  reason?: string;
  thread_id?: string;
  session_id?: string;
  model?: string;
  tools?: Array<{ call_id: string; name: string; args?: Record<string, unknown> }>;
  [key: string]: unknown;
}

export interface StreamEvent {
  type: StreamEventType;
  data?: StreamEventData;
}
