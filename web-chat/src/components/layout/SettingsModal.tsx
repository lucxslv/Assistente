import React, { useState, useEffect } from 'react';
import { Sliders, Check, Globe, Radio, RefreshCw, Server, CheckCircle2, ChevronDown } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AppSettings, StreamingMode } from '../../types/settings';
import { api } from '../../services/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: Partial<AppSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [wsUrl, setWsUrl] = useState(settings.wsUrl);
  const [streamingMode, setStreamingMode] = useState<StreamingMode>(settings.streamingMode);
  const [autoScroll, setAutoScroll] = useState(settings.autoScroll);
  const [sendOnEnter, setSendOnEnter] = useState(settings.sendOnEnter);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled);

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiUrl(settings.apiUrl);
      setWsUrl(settings.wsUrl);
      setStreamingMode(settings.streamingMode);
      setAutoScroll(settings.autoScroll);
      setSendOnEnter(settings.sendOnEnter);
      setSoundEnabled(settings.soundEnabled);
      setTestResult(null);
      setSavedSuccess(false);
    }
  }, [isOpen, settings]);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const health = await api.checkHealth();
      if (health.ok) {
        setTestResult({
          ok: true,
          message: `Conectado com sucesso (${health.service || 'Charlie Brain API'}).`,
        });
      } else {
        setTestResult({
          ok: false,
          message: 'Servidor respondeu, mas status não é de prontidão.',
        });
      }
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: `Falha na conexão: ${(err as Error)?.message || 'Servidor inacessível.'}`,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = () => {
    onSaveSettings({
      apiUrl,
      wsUrl,
      streamingMode,
      autoScroll,
      sendOnEnter,
      soundEnabled,
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Preferências do Charlie Web"
      description="Personalize o comportamento do chat e verifique o status do sistema"
      maxWidth="md"
    >
      <div className="space-y-5 text-left text-xs">
        {/* Status de Conexão Pré-configurada (Zero Configuração Manual) */}
        <div className="p-3.5 rounded-xl bg-[#0D0F14] border border-emerald-500/20 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-zinc-100 text-xs">Conexão 100% Automática</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              PRÉ-CONFIGURADO
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            O Charlie Web detecta e conecta-se automaticamente ao backend disponível (motor local ou nuvem de alta disponibilidade) com failover silencioso. Não é necessária nenhuma configuração manual.
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] mt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleTestConnection}
              isLoading={testingConnection}
              className="gap-1.5 text-xs py-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Verificar Conexão</span>
            </Button>

            {testResult && (
              <span
                className={`text-xs ${
                  testResult.ok ? 'text-emerald-400 font-medium' : 'text-red-400'
                }`}
              >
                {testResult.message}
              </span>
            )}
          </div>
        </div>

        {/* Preferências de Uso do Chat */}
        <div className="space-y-3 pt-1">
          <h3 className="text-xs font-semibold text-zinc-300 font-mono uppercase tracking-wider">
            Comportamento do Chat
          </h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#14171E] border border-white/[0.06]">
              <div>
                <span className="text-xs font-medium text-zinc-100">Autoscroll Inteligente</span>
                <p className="text-[11px] text-zinc-400">Rolar automaticamente para a base enquanto o Charlie digita</p>
              </div>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-primary focus:ring-0 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#14171E] border border-white/[0.06]">
              <div>
                <span className="text-xs font-medium text-zinc-100">Enviar Mensagem com Enter</span>
                <p className="text-[11px] text-zinc-400">Pressione Enter para enviar • Shift+Enter para quebra de linha</p>
              </div>
              <input
                type="checkbox"
                checked={sendOnEnter}
                onChange={(e) => setSendOnEnter(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-primary focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Opções Avançadas (Colapsadas por padrão para não exigir configuração manual) */}
        <details className="group pt-2 border-t border-white/[0.06]">
          <summary className="flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer py-1 font-mono">
            <span>Opções Avançadas de Desenvolvedor</span>
            <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
          </summary>

          <div className="space-y-3 pt-3 mt-1">
            <div className="space-y-1.5">
              <label className="font-medium text-zinc-400 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-primary" />
                <span>URL Customizada da API (Opcional)</span>
              </label>
              <Input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="/api ou http://localhost:8005/api"
                className="font-mono text-xs"
              />
              <span className="text-[10px] text-zinc-500">
                Padrão automático: <code>{api.getBaseUrl()}</code>
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-zinc-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-primary" />
                <span>Modo de Transmissão</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'sse', name: 'SSE Stream (Padrão)', desc: 'Server-Sent Events com failover' },
                  { id: 'ws', name: 'WebSocket', desc: 'Canal duplex bidirecional' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setStreamingMode(mode.id as StreamingMode)}
                    className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                      streamingMode === mode.id
                        ? 'bg-zinc-800 border-zinc-600 text-white'
                        : 'bg-[#14171E] border-white/[0.08] text-zinc-400 hover:border-white/[0.16]'
                    }`}
                  >
                    <div className="font-semibold text-xs text-zinc-200">{mode.name}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </details>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/[0.06]">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} className="gap-1.5">
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span>Salvo!</span>
              </>
            ) : (
              <span>Salvar Preferências</span>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
