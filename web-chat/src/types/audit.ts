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

export interface AuditMetrics {
  total_requests: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  unique_users_count?: number;
  unique_users?: number;
  avg_cost_per_request?: number;
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
