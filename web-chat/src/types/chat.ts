export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error';

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string; // Base64 data URL for images or text preview
  textPreview?: string;
  isImage: boolean;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status?: MessageStatus;
  attachments?: FileAttachment[];
  threadId?: string;
  error?: string;
  isStreaming?: boolean;
}

export interface Thread {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preview?: string;
}

export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'error';

export type CharlieAIStatus = 'idle' | 'thinking' | 'speaking' | 'error';

export interface StreamEventData {
  token?: string;
  reply?: string;
  error?: string;
  status?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  [key: string]: unknown;
}

export interface StreamEvent {
  type:
    | 'token'
    | 'done'
    | 'error'
    | 'state'
    | 'tool_call'
    | 'ping'
    | 'pong'
    | 'reset_and_fallback'
    | 'status'
    | 'client_tool_request';
  data?: StreamEventData;
}
