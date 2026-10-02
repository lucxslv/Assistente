import { api } from './api';
import { StorageService } from './storage';
import { AuditMetrics, AuditLogsResponse, AuditFilterParams } from '../types/audit';

export class AuditService {
  /**
   * Obtém as métricas agregadas de telemetria, contagem de tokens e custos em USD.
   */
  public static async getMetrics(): Promise<AuditMetrics> {
    return api.get<AuditMetrics>('/admin/audit/metrics');
  }

  /**
   * Obtém a lista paginada e filtrada de interações de auditoria.
   */
  public static async getLogs(params: AuditFilterParams = {}): Promise<AuditLogsResponse> {
    const searchParams = new URLSearchParams();

    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.search && params.search.trim()) searchParams.set('search', params.search.trim());
    if (params.userEmail && params.userEmail.trim()) searchParams.set('user_email', params.userEmail.trim());
    if (params.modelName && params.modelName.trim()) searchParams.set('model_name', params.modelName.trim());

    const queryString = searchParams.toString();
    const endpoint = `/admin/audit/logs${queryString ? `?${queryString}` : ''}`;

    return api.get<AuditLogsResponse>(endpoint);
  }

  /**
   * Exporta os registros de auditoria em CSV ou JSON com download automático no navegador.
   */
  public static async exportLogs(format: 'csv' | 'json' = 'csv'): Promise<void> {
    const baseUrl = api.getBaseUrl();
    const url = `${baseUrl}/admin/audit/export?format_type=${format}`;

    const headers: Record<string, string> = {};
    const token = StorageService.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token.replace(/^Bearer\s+/i, '').trim()}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Falha ao exportar registros de auditoria (HTTP ${response.status})`);
    }

    if (format === 'json') {
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      this.triggerDownload(blob, `charlie_audit_logs_${new Date().toISOString().slice(0, 10)}.json`);
    } else {
      const blob = await response.blob();
      this.triggerDownload(blob, `charlie_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    }
  }

  private static triggerDownload(blob: Blob, filename: string): void {
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
  }
}
