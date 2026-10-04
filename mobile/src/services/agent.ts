import { api } from '@/src/services/api';
import { AgentSession } from '@/src/types/api';

export const agentService = {
  start: (goal: string, project = 'Charlie Mobile') => api.post<{ graph: AgentSession }>('/agent/goal', { goal, project }),
  active: () => api.get<{ active: boolean; session: AgentSession | null; is_paused: boolean; is_cancelled: boolean }>('/agent/session'),
  pause: () => api.post<void>('/agent/pause'),
  resume: () => api.post<void>('/agent/resume'),
  cancel: () => api.post<void>('/agent/cancel'),
};
