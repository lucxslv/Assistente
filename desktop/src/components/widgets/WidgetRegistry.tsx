import React from "react";
import {
  Activity,
  HardDrive,
  Database,
  Wifi,
  AlertTriangle,
  Cpu,
  Server,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import {
  WidgetPayload,
  ServerHealthWidgetData,
  StorageWidgetData,
  UnavailableWidgetData,
} from "../../types";

interface WidgetErrorBoundaryProps {
  children: React.ReactNode;
  fallbackText?: string;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
}

export class WidgetErrorBoundary extends React.Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[Desktop WidgetErrorBoundary] Erro ao renderizar widget:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="my-2.5 p-3 rounded-[var(--radius-md)] bg-[var(--surface-hover)] border border-[var(--border)] text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-2 font-medium text-[var(--warning)] mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Visualização interativa indisponível</span>
          </div>
          {this.props.fallbackText && (
            <p className="text-[12px] text-[var(--text-muted)] font-mono leading-relaxed">
              {this.props.fallbackText}
            </p>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Widget interativo de Saúde do Servidor e Hardware.
 */
export const ServerHealthWidget: React.FC<{ data: ServerHealthWidgetData }> = ({ data }) => {
  const isHealthy = data.status === "healthy" || (!data.status && data.database !== false);
  const cpuVal = Math.min(100, Math.max(0, Math.round(data.cpuPercent || 0)));
  const ramVal = Math.min(100, Math.max(0, Math.round(data.ramPercent || 0)));

  return (
    <div className="my-3 p-3.5 rounded-[var(--radius-lg)] bg-[#101217] border border-[var(--border)] text-left select-none shadow-sm transition hover:border-[var(--accent-soft-border)]">
      {/* Header do Widget */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border)]/70 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-[var(--surface-hover)] text-[var(--accent)]">
            <Server className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {data.title || "Status do Sistema & Infraestrutura"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-hover)]">
          {isHealthy ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
              <span className="text-[var(--success)]">Operacional</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
              <span className="text-[var(--warning)]">Degradado</span>
            </>
          )}
        </div>
      </div>

      {/* Grid de Métricas */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* CPU */}
        <div className="p-2.5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]/50">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] mb-1.5">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-[var(--text-secondary)]" /> CPU
            </span>
            <span className="font-mono text-[var(--text-primary)] font-semibold">{cpuVal}%</span>
          </div>
          <div className="w-full h-1.5 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                cpuVal > 80 ? "bg-[var(--danger)]" : cpuVal > 50 ? "bg-[var(--warning)]" : "bg-[var(--accent)]"
              }`}
              style={{ width: `${cpuVal}%` }}
            />
          </div>
        </div>

        {/* RAM */}
        <div className="p-2.5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]/50">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] mb-1.5">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-[var(--text-secondary)]" /> RAM
            </span>
            <span className="font-mono text-[var(--text-primary)] font-semibold">{ramVal}%</span>
          </div>
          <div className="w-full h-1.5 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                ramVal > 85 ? "bg-[var(--danger)]" : ramVal > 65 ? "bg-[var(--warning)]" : "bg-indigo-400"
              }`}
              style={{ width: `${ramVal}%` }}
            />
          </div>
        </div>
      </div>

      {/* Serviços Conectados */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]/50 text-[11px] text-[var(--text-muted)]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Database className="w-3 h-3" />
            <span>Banco:</span>
            {data.database !== false && data.database !== "offline" ? (
              <CheckCircle2 className="w-3 h-3 text-[var(--success)]" />
            ) : (
              <XCircle className="w-3 h-3 text-[var(--danger)]" />
            )}
          </span>
          <span className="flex items-center gap-1">
            <Wifi className="w-3 h-3" />
            <span>WebSocket:</span>
            {data.webSocket !== false && data.webSocket !== "disconnected" ? (
              <CheckCircle2 className="w-3 h-3 text-[var(--success)]" />
            ) : (
              <Clock className="w-3 h-3 text-[var(--warning)]" />
            )}
          </span>
        </div>
        {data.actionLabel && (
          <span className="text-[10px] text-[var(--accent)] font-mono">{data.actionLabel}</span>
        )}
      </div>
    </div>
  );
};

/**
 * Widget interativo de Armazenamento em Disco.
 */
export const StorageWidget: React.FC<{ data: StorageWidgetData }> = ({ data }) => {
  const percent = Math.min(100, Math.max(0, Math.round(data.usedPercent || 0)));

  return (
    <div className="my-3 p-3.5 rounded-[var(--radius-lg)] bg-[#101217] border border-[var(--border)] text-left select-none shadow-sm transition hover:border-[var(--accent-soft-border)]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-[var(--surface-hover)] text-indigo-400">
            <HardDrive className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {data.title || "Armazenamento em Disco"}
          </span>
        </div>
        <span className="text-[11px] font-mono font-medium text-[var(--text-secondary)]">
          {data.usedLabel} / {data.totalLabel}
        </span>
      </div>

      <div className="w-full h-2 bg-[var(--surface)] rounded-full overflow-hidden p-0.5 border border-[var(--border)]/40 my-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            percent > 90 ? "bg-[var(--danger)]" : percent > 75 ? "bg-[var(--warning)]" : "bg-[var(--accent)]"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <span>Ocupação Total</span>
        <span className="font-mono font-semibold text-[var(--text-primary)]">{percent}%</span>
      </div>
    </div>
  );
};

/**
 * Widget amigável para recursos ou componentes indisponíveis no momento.
 */
export const UnavailableWidget: React.FC<{
  fallbackText: string;
  data?: UnavailableWidgetData;
}> = ({ fallbackText, data }) => {
  return (
    <div className="my-2.5 p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-left select-none">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--warning)] mb-1">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Componente interativo indisponível</span>
        {data?.originalKind && (
          <span className="text-[10px] font-mono text-[var(--text-muted)] px-1.5 py-0.2 rounded bg-[var(--surface-elevated)]">
            {data.originalKind}
          </span>
        )}
      </div>
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mt-1">
        {fallbackText || "Este componente não pôde ser renderizado na interface interativa."}
      </p>
      {data?.reason && (
        <span className="text-[10px] text-[var(--text-muted)] italic block mt-1">
          Motivo: {data.reason}
        </span>
      )}
    </div>
  );
};

/**
 * Roteador central de Widgets do Charlie Desktop.
 */
export const WidgetRegistry: React.FC<{ widget: WidgetPayload }> = ({ widget }) => {
  if (!widget) return null;

  return (
    <WidgetErrorBoundary fallbackText={widget.fallbackText}>
      {(() => {
        switch (widget.type) {
          case "server_health":
            return <ServerHealthWidget data={widget.data as ServerHealthWidgetData} />;
          case "storage_usage":
            return <StorageWidget data={widget.data as StorageWidgetData} />;
          case "embedded_widget_unavailable":
            return (
              <UnavailableWidget
                fallbackText={widget.fallbackText}
                data={widget.data as UnavailableWidgetData}
              />
            );
          default:
            return (
              <UnavailableWidget
                fallbackText={widget.fallbackText || `Widget '${widget.type}' não suportado.`}
                data={{ originalKind: widget.type, reason: "Tipo de widget não registrado no cliente Desktop" }}
              />
            );
        }
      })()}
    </WidgetErrorBoundary>
  );
};
