import React, { useState } from "react";
import { X, Home, Cpu, Mic, Database, CheckCircle2, AlertCircle, Cloud, Save } from "lucide-react";
import { Settings } from "../types";
import { setCustomApiUrl } from "../services/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
}) => {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("charlie_api_url") || "");
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSaveApiUrl = () => {
    setCustomApiUrl(apiUrl);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      window.location.reload();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="w-full max-w-lg bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-foreground">Configurações do Charlie</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Servidor na Nuvem / API Endpoint */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Cloud className="w-4 h-4 text-primary" />
              <span>Cérebro na Nuvem (Servidor API)</span>
            </div>
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Deixe em branco para usar o backend local (<code className="text-primary font-mono">http://127.0.0.1:8005</code>) ou insira a URL pública do seu deploy no Render/Railway.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="https://seu-charlie.onrender.com"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="flex-1 bg-background border border-border/70 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleSaveApiUrl}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar
                </button>
              </div>
              {savedSuccess && (
                <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> URL salva com sucesso! Reconectando...
                </div>
              )}
            </div>
          </div>
          {/* Home Assistant */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Home className="w-4 h-4 text-primary" />
              <span>Automação Residencial (Home Assistant)</span>
            </div>
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status da Integração:</span>
                {settings?.home_assistant_configured ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                    <AlertCircle className="w-3.5 h-3.5" /> Não configurado (.env)
                  </span>
                )}
              </div>
              {settings?.home_assistant_url && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">URL:</span>
                  <span className="font-mono text-foreground">{settings.home_assistant_url}</span>
                </div>
              )}
            </div>
          </div>

          {/* Inteligência & Modelos */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Cpu className="w-4 h-4 text-primary" />
              <span>Cérebro & LLM</span>
            </div>
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Provedor Ativo:</span>
                <span className="font-medium text-foreground uppercase tracking-wide px-2 py-0.5 rounded bg-primary/20 text-primary">
                  {settings?.llm_provider || "Gemini"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Modelo Gemini:</span>
                <span className="font-mono text-foreground">{settings?.gemini_model}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Modelo Groq:</span>
                <span className="font-mono text-foreground">{settings?.groq_model}</span>
              </div>
            </div>
          </div>

          {/* Voz & Wake Word */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Mic className="w-4 h-4 text-primary" />
              <span>Áudio & Palavra de Ativação</span>
            </div>
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Voz TTS:</span>
                <span className="text-foreground">{settings?.tts_voice}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Wake Word:</span>
                <span className="font-semibold text-foreground capitalize">"{settings?.wake_word}"</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Detecção Contínua:</span>
                <span className={settings?.wake_word_enabled ? "text-emerald-400" : "text-muted-foreground"}>
                  {settings?.wake_word_enabled ? "Ativada" : "Desativada"}
                </span>
              </div>
            </div>
          </div>

          {/* Banco de Dados / Supabase */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Database className="w-4 h-4 text-primary" />
              <span>Armazenamento & Nuvem</span>
            </div>
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-between">
              <span className="text-muted-foreground">Histórico em Nuvem:</span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Supabase PostgreSQL Ativo
              </span>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3.5 border-t border-border/60 bg-card/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition-all shadow-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
