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
