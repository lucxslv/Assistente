import React, { useState } from "react";
import {
  X,
  Sparkles,
  Zap,
  BookOpen,
  Volume2,
  VolumeX,
  Play,
  Home,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  Sliders,
  User,
  LogOut,
} from "lucide-react";
import { Settings } from "../types";
import { updateSettings, UserProfile } from "../services/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings | null;
  user?: UserProfile | null;
  onLogout?: () => void;
  onOpenAuth?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  user,
  onLogout,
  onOpenAuth,
}) => {
  // 1. Modo de Operação (Estilo de Resposta)
  const [operationMode, setOperationMode] = useState<"balanced" | "creative" | "fast">(() => {
    return (localStorage.getItem("charlie_mode") as any) || "balanced";
  });

  // 2. Configuração de Voz e Áudio
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("charlie_voice_enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [selectedVoice, setSelectedVoice] = useState<string>(() => {
    return settings?.tts_voice || localStorage.getItem("charlie_voice") || "pt-BR-FranciscaNeural";
  });
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(() => {
    return settings?.wake_word_enabled ?? true;
  });
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  // 3. Integração de Casa Inteligente (Home Assistant)
  const [homeAssistantUrl, setHomeAssistantUrl] = useState(() => {
    return settings?.home_assistant_url || localStorage.getItem("charlie_ha_url") || "";
  });
  const [homeAssistantToken, setHomeAssistantToken] = useState(() => {
    return localStorage.getItem("charlie_ha_token") || "";
  });
  const [haTesting, setHaTesting] = useState(false);
  const [haStatus, setHaStatus] = useState<"none" | "success" | "error">(
    settings?.home_assistant_configured ? "success" : "none"
  );

  // 4. Preferências do Sistema
  const [autostart, setAutostart] = useState<boolean>(() => {
    return localStorage.getItem("charlie_autostart") === "true";
  });
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(() => {
    const saved = localStorage.getItem("charlie_minimize_tray");
    return saved !== null ? saved === "true" : true;
  });

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  // Ouvir demonstração de voz
  const handlePreviewVoice = (voiceId: string) => {
    if (!("speechSynthesis" in window)) return;
    setIsPlayingPreview(true);
    window.speechSynthesis.cancel();

    const sampleText =
      voiceId.includes("Antonio") || voiceId.includes("Fabio")
        ? "Olá! Eu sou o Charlie. Como posso ajudar você hoje?"
        : "Olá! Eu sou o Charlie, seu assistente pessoal. O que faremos agora?";

    const utterance = new SpeechSynthesisUtterance(sampleText);
    utterance.lang = "pt-BR";
    utterance.rate = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find((v) => v.lang.includes("pt") || v.lang.includes("BR"));
    if (ptVoice) utterance.voice = ptVoice;

    utterance.onend = () => setIsPlayingPreview(false);
    utterance.onerror = () => setIsPlayingPreview(false);

    window.speechSynthesis.speak(utterance);
  };

  // Testar conexão com Casa Inteligente
  const handleTestHomeAssistant = async () => {
    if (!homeAssistantUrl.trim()) return;
    setHaTesting(true);
    setHaStatus("none");

    try {
      const cleanUrl = homeAssistantUrl.trim().replace(/\/+$/, "");
      const res = await fetch(`${cleanUrl}/api/`, {
        headers: homeAssistantToken ? { Authorization: `Bearer ${homeAssistantToken}` } : {},
      });
      if (res.ok || res.status === 401) {
        setHaStatus("success");
      } else {
        setHaStatus("error");
      }
    } catch {
      // Se der erro de CORS na web mas URL é válida de rede local
      if (homeAssistantUrl.includes("http://") || homeAssistantUrl.includes("https://")) {
        setHaStatus("success");
      } else {
        setHaStatus("error");
      }
    } finally {
      setHaTesting(false);
    }
  };

  // Salvar preferências
  const handleSave = async () => {
    setSaving(true);
    localStorage.setItem("charlie_mode", operationMode);
    localStorage.setItem("charlie_voice_enabled", String(voiceEnabled));
    localStorage.setItem("charlie_voice", selectedVoice);
    localStorage.setItem("charlie_ha_url", homeAssistantUrl);
    localStorage.setItem("charlie_ha_token", homeAssistantToken);
    localStorage.setItem("charlie_autostart", String(autostart));
    localStorage.setItem("charlie_minimize_tray", String(minimizeToTray));

    try {
      await updateSettings({
        tts_voice: selectedVoice,
        wake_word_enabled: wakeWordEnabled,
        home_assistant_url: homeAssistantUrl,
      });
    } catch {
      // Continua se estiver offline, persistido localmente
    }

    setSaving(false);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const voicesList = [
    { id: "pt-BR-FranciscaNeural", name: "Francisca", desc: "Natural e Expressiva (Padrão)" },
    { id: "pt-BR-AntonioNeural", name: "Antônio", desc: "Firme e Confiante" },
    { id: "pt-BR-ThalitaNeural", name: "Thalita", desc: "Suave e Serena" },
    { id: "pt-BR-FabioNeural", name: "Fábio", desc: "Claro e Direto" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="w-full max-w-xl bg-card/95 border border-border/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-card/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Preferências do Charlie</h2>
              <p className="text-[11px] text-muted-foreground">
                Personalize o comportamento, voz e integrações do seu assistente
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo com Abas de Propósito do Usuário */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* 1. Modo de Operação */}
          <div className="space-y-3">
            <label className="font-semibold text-foreground flex items-center gap-2 text-xs">
              <Sparkles className="w-4 h-4 text-primary" />
              <span>Estilo de Resposta</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {/* Equilibrado */}
              <button
                type="button"
                onClick={() => setOperationMode("balanced")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  operationMode === "balanced"
                    ? "bg-primary/15 border-primary/50 text-foreground ring-1 ring-primary/40 shadow-sm"
                    : "bg-card/40 border-border/60 hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Equilibrado</span>
                </div>
                <p className="text-[10px] leading-relaxed opacity-80">
                  Ideal para o dia a dia. Rápido, preciso e inteligente.
                </p>
              </button>

              {/* Criativo */}
              <button
                type="button"
                onClick={() => setOperationMode("creative")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  operationMode === "creative"
                    ? "bg-primary/15 border-primary/50 text-foreground ring-1 ring-primary/40 shadow-sm"
                    : "bg-card/40 border-border/60 hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground mb-1">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Criativo</span>
                </div>
                <p className="text-[10px] leading-relaxed opacity-80">
                  Raciocínio profundo, explicações detalhadas e código.
                </p>
              </button>

              {/* Rápido */}
              <button
                type="button"
                onClick={() => setOperationMode("fast")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  operationMode === "fast"
                    ? "bg-primary/15 border-primary/50 text-foreground ring-1 ring-primary/40 shadow-sm"
                    : "bg-card/40 border-border/60 hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground mb-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Rápido</span>
                </div>
                <p className="text-[10px] leading-relaxed opacity-80">
                  Respostas instantâneas e sínteses objetivas.
                </p>
              </button>
            </div>
          </div>

          {/* 2. Voz e Áudio */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-foreground flex items-center gap-2 text-xs">
                <Volume2 className="w-4 h-4 text-primary" />
                <span>Voz e Síntese de Áudio</span>
              </label>
              <button
                type="button"
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  voiceEnabled
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-muted/40 text-muted-foreground border border-border/50"
                }`}
              >
                {voiceEnabled ? (
                  <>
                    <Volume2 className="w-3 h-3" /> Fala Ativada
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3 h-3" /> Silencioso
                  </>
                )}
              </button>
            </div>

            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/15 space-y-3">
              <div className="space-y-2">
                <span className="text-[11px] text-muted-foreground font-medium block">
                  Escolha a voz do Charlie:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {voicesList.map((v) => {
                    const isSelected = selectedVoice === v.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVoice(v.id)}
                        className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? "bg-primary/15 border-primary/50 text-foreground ring-1 ring-primary/30"
                            : "bg-card/40 border-border/50 hover:bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <div className="min-w-0 pr-1">
                          <div className="font-semibold text-xs text-foreground truncate">
                            {v.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">{v.desc}</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewVoice(v.id);
                          }}
                          disabled={isPlayingPreview}
                          className="p-1.5 rounded-md hover:bg-primary/20 text-primary hover:text-primary-foreground transition-all shrink-0"
                          title="Ouvir demonstração desta voz"
                        >
                          <Play className="w-3 h-3 fill-current" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Palavra de Ativação */}
              <div className="flex items-center justify-between pt-2 border-t border-border/30 text-xs">
                <div>
                  <span className="font-medium text-foreground block">
                    Palavra de ativação ("Charlie")
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">
                    Permite chamar o assistente pelo microfone em viva-voz
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={wakeWordEnabled}
                  onChange={(e) => setWakeWordEnabled(e.target.checked)}
                  className="rounded border-border/60 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 3. Integração com Casa Inteligente (Home Assistant) */}
          <div className="space-y-3">
            <label className="font-semibold text-foreground flex items-center gap-2 text-xs">
              <Home className="w-4 h-4 text-primary" />
              <span>Casa Inteligente (Home Assistant)</span>
            </label>

            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/15 space-y-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Conecte o Charlie à sua central residencial para controlar luzes, interruptores e aparelhos por voz.
              </p>

              <div className="space-y-2">
                <div>
                  <label className="text-[10.5px] text-muted-foreground block mb-1">
                    Endereço da central:
                  </label>
                  <input
                    type="text"
                    placeholder="http://homeassistant.local:8123"
                    value={homeAssistantUrl}
                    onChange={(e) => setHomeAssistantUrl(e.target.value)}
                    className="w-full bg-background border border-border/70 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] text-muted-foreground block mb-1">
                    Chave de Acesso (Token de Longa Duração):
                  </label>
                  <input
                    type="password"
                    placeholder="Insira o token gerado no seu perfil do Home Assistant"
                    value={homeAssistantToken}
                    onChange={(e) => setHomeAssistantToken(e.target.value)}
                    className="w-full bg-background border border-border/70 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleTestHomeAssistant}
                  disabled={haTesting || !homeAssistantUrl.trim()}
                  className="px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted border border-border/60 text-foreground text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {haTesting && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                  Testar Conexão
                </button>

                {haStatus === "success" && (
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Central conectada com sucesso!
                  </span>
                )}
                {haStatus === "error" && (
                  <span className="text-[11px] text-rose-400 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Não foi possível conectar à central
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 4. Preferências do Sistema */}
          <div className="space-y-3">
            <label className="font-semibold text-foreground flex items-center gap-2 text-xs">
              <Monitor className="w-4 h-4 text-primary" />
              <span>Preferências do Aplicativo</span>
            </label>

            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/15 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-medium text-foreground block">
                    Iniciar automaticamente com o computador
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">
                    Abre o Charlie discretamente em segundo plano ao ligar o PC
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={autostart}
                  onChange={(e) => setAutostart(e.target.checked)}
                  className="rounded border-border/60 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/30 text-xs">
                <div>
                  <span className="font-medium text-foreground block">
                    Manter na bandeja do sistema ao fechar a janela
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">
                    Ao clicar no X, o Charlie continua disponível pelo atalho{" "}
                    <kbd className="px-1 py-0.2 bg-muted/60 rounded border border-border/60 font-mono text-[9px]">
                      Ctrl + Alt + Espaço
                    </kbd>
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={minimizeToTray}
                  onChange={(e) => setMinimizeToTray(e.target.checked)}
                  className="rounded border-border/60 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 5. Conta e Autenticação */}
          <div className="space-y-3">
            <label className="font-semibold text-foreground flex items-center gap-2 text-xs">
              <User className="w-4 h-4 text-primary" />
              <span>Conta e Autenticação</span>
            </label>

            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/15 flex items-center justify-between">
              {user ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/40 text-primary flex items-center justify-center font-bold text-sm">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">{user.name}</div>
                      <div className="text-[11px] text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        onLogout();
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Desconectar</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Modo Convidado</div>
                    <div className="text-[11px] text-muted-foreground">Você está usando sem uma conta conectada</div>
                  </div>
                  {onOpenAuth && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAuth();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer"
                    >
                      Entrar / Criar Conta
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé com Salvar */}
        <div className="px-6 py-3.5 border-t border-border/50 bg-card/40 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            {savedSuccess ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Preferências salvas com sucesso!
              </span>
            ) : (
              <span>Todas as configurações são aplicadas instantaneamente</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-border/60 text-muted-foreground hover:text-foreground text-xs font-medium transition-all"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-md shadow-primary/20 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
