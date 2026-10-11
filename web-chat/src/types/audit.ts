export interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  ip_address: string | null;
  session_id: string | null;
  user_prompt: string;
  model_response: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  tokens_source?: 'api' | 'heuristic';
  cached_tokens?: number;
  latency_ms?: number;
  ttft_ms?: number;
  route_mode?: string;
  provider_name?: string;
  fallback_used?: boolean;
  fallback_reason?: string | null;
  status?: string;
  error_category?: string | null;
  created_at: string;
}

export interface ModelMetricBreakdown {
  model_name: string;
  requests_count?: number;
  count?: number;
  total_tokens: number;
  total_cost_usd?: number;
  total_cost?: number;
}

export interface TopUserMetric {
  user_email: string;
  requests_count?: number;
  requests?: number;
  total_cost_usd?: number;
  total_cost?: number;
  last_active?: string;
}

export interface DailyCostMetric {
  date?: string;
  day?: string;
  cost_usd?: number;
  total_cost_usd?: number;
  requests_count?: number;
  requests?: number;
  total_tokens?: number;
}

export interface CostSourceBreakdown {
  api_reported_requests: number;
  api_reported_tokens: number;
  api_reported_cost_usd: number;
  heuristic_estimated_requests: number;
  heuristic_estimated_tokens: number;
  heuristic_estimated_cost_usd: number;
  cached_tokens_total: number;
}

export interface TechnicalDiagnostics {
  latency_p50_ms: number;
  latency_p95_ms: number;
  ttft_p50_ms: number;
  ttft_p95_ms: number;
  fallback_count: number;
  fallback_rate: number;
  error_count: number;
  cancelled_count: number;
  interrupted_count: number;
  errors_by_category: Array<{ category: string; count: number }>;
  providers_breakdown: Array<{
    provider_name: string;
    requests_count: number;
    fallback_count: number;
    error_count: number;
    avg_latency_ms: number;
  }>;
}

export interface QualityFeedbackItem {
  message_id: string;
  session_id?: string;
  user_id?: string;
  rating: 'up' | 'down';
  comment?: string;
  updated_at?: string;
  message_content?: string;
  model_name?: string;
}

export interface QualitySummary {
  positive_count: number;
  negative_count: number;
  total_feedback: number;
  approval_rate: number;
  recent_negative_feedback: QualityFeedbackItem[];
}

export interface OperationalLimits {
  default_daily_token_limit: number;
  default_daily_request_limit: number;
  default_monthly_cost_limit_usd: number;
  chat_rate_limit_per_min: number;
}

export interface AuditMetrics {
  total_requests: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  unique_users_count?: number;
  unique_users?: number;
  avg_cost_per_request?: number;
  cost_source_breakdown?: CostSourceBreakdown;
  technical_diagnostics?: TechnicalDiagnostics;
  quality_summary?: QualitySummary;
  operational_limits?: OperationalLimits;
  models_breakdown: ModelMetricBreakdown[];
  top_users: TopUserMetric[];
  recent_daily?: DailyCostMetric[];
  daily_costs?: DailyCostMetric[];
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  page: number;
  limit: number;
  total: number;
  totalPages?: number;
  total_pages?: number;
}

export interface AuditFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  userEmail?: string;
  modelName?: string;
}

export interface AuditUserSummary {
  user_id: string;
  user_email: string;
  name?: string;
  username?: string;
  created_at?: string | null;
  total_messages: number;
  total_sessions: number;
  total_cost_usd: number;
  api_cost_usd?: number;
  estimated_cost_usd?: number;
  total_tokens: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  error_count?: number;
  last_active: string | null;
  ip_address: string;
  is_suspended?: boolean;
  suspended_reason?: string | null;
  daily_token_limit?: number;
  daily_request_limit?: number;
  monthly_cost_limit_usd?: number;
}

export interface AuditMessageItem {
  id: string;
  created_at: string;
  ip_address: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  user_prompt: string;
  model_response: string;
}

export interface UserConversationSession {
  session_id: string;
  started_at: string | null;
  updated_at: string | null;
  message_count: number;
  total_cost_usd: number;
  total_tokens: number;
  model_names: string[];
  messages: AuditMessageItem[];
}

export interface UserConversationsResponse {
  user_email: string;
  user_id: string;
  total_messages: number;
  total_cost_usd: number;
  sessions: UserConversationSession[];
}
