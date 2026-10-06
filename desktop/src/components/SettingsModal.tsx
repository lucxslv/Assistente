import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Zap,
  BookOpen,
  Volume2,
  VolumeX,
  Play,
  Home,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  User,
  LogOut,
  Brain,
  FolderGit2,
  Trash2,
  ShieldCheck,
  Plus,
  Sliders,
  Folder,
  Smartphone,
  Globe,
  Server,
  Wifi,
  RefreshCw,
} from "lucide-react";
import { Settings } from "../types";
import {
  updateSettings,
  UserProfile,
  fetchUserMemories,
  clearUserMemories,
  getServerMode,
  setServerMode,
  CLOUD_API,
  LOCAL_API,
} from "../services/api";
import { PairingPanel } from "./PairingPanel";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings | null;
  user?: UserProfile | null;
  onLogout?: () => void;
  onOpenAuth?: () => void;
  onOpenMobilePair?: () => void;
  initialTab?: TabType;
}

export type TabType = "account" | "server" | "pairing" | "brain" | "rag" | "voice" | "automations";

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  user,
  onLogout,
  onOpenAuth,
  onOpenMobilePair: _onOpenMobilePair,
  initialTab = "account",
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // 1. Modo de Operação (Estilo de Resposta)
  const [operationMode, setOperationMode] = useState<"balanced" | "creative" | "fast">(() => {
    return (localStorage.getItem("charlie_mode") as any) || "balanced";
  });

  // 2. Memória Episódica
  const [facts, setFacts] = useState<string[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [clearingMemories, setClearingMemories] = useState(false);
  const [memoryClearSuccess, setMemoryClearSuccess] = useState(false);

  // 3. Base de Conhecimento (RAG)
  const [ragTokenLimit, setRagTokenLimit] = useState<number>(() => {
    const saved = localStorage.getItem("charlie_rag_tokens");
    return saved ? parseInt(saved, 10) : 8000;
  });
  const [ragFolders, setRagFolders] = useState<string[]>(() => {
    const saved = localStorage.getItem("charlie_rag_folders");
    return saved ? JSON.parse(saved) : ["C:\\Projetos", "C:\\Documentos"];
  });
  const [newFolderPath, setNewFolderPath] = useState("");
  const [showAddFolder, setShowAddFolder] = useState(false);

  // 4. Configuração de Voz e Áudio
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

  // 5. Automações & Casa Inteligente (Home Assistant)
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

  // Preferências do Sistema
  const [autostart, setAutostart] = useState<boolean>(() => {
    return localStorage.getItem("charlie_autostart") === "true";
  });
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(() => {
    const saved = localStorage.getItem("charlie_minimize_tray");
    return saved !== null ? saved === "true" : true;
  });

  // 6. Configurações de Conexão com o Servidor (Nuvem vs Local vs Custom)
  const [serverMode, setServerModeState] = useState<"cloud" | "local" | "custom">(() => getServerMode());
  const [customServerUrl, setCustomServerUrl] = useState<string>(() => {
    return (typeof window !== "undefined" ? localStorage.getItem("charlie_api_url") : null) || "";
  });
  const [serverTesting, setServerTesting] = useState(false);
  const [serverTestResult, setServerTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    service?: string;
    version?: string;
    dbConnected?: boolean;
    message?: string;
  } | null>(null);

  const handleTestServerConnection = async () => {
    setServerTesting(true);
    setServerTestResult(null);
    const targetUrl =
      serverMode === "custom"
        ? (customServerUrl.trim().endsWith("/api") ? customServerUrl.trim() : `${customServerUrl.trim()}/api`)
        : serverMode === "local"
        ? LOCAL_API
        : CLOUD_API;

    const start = performance.now();
    try {
      const res = await fetch(`${targetUrl}/health`, { signal: AbortSignal.timeout(4500) });
      const elapsed = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        setServerTestResult({
          ok: true,
          latencyMs: elapsed,
          service: data.service || "Charlie API",
          version: data.version || "2.0.0",
          dbConnected: data.database_connected ?? true,
          message: "Servidor online e respondendo!",
        });
      } else {
        setServerTestResult({
          ok: false,
          latencyMs: elapsed,
          message: `O servidor respondeu com status HTTP ${res.status}.`,
        });
      }
    } catch (err: any) {
      setServerTestResult({
        ok: false,
        message: err?.message || "Não foi possível conectar ao servidor. Verifique o endereço e sua conexão.",
      });
    } finally {
      setServerTesting(false);
    }
  };

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Carrega memórias reais do backend quando a aba Cérebro for acessada
  useEffect(() => {
    if (isOpen && activeTab === "brain") {
      setLoadingMemories(true);
      fetchUserMemories()
        .then((data) => {
          setFacts(data.facts || []);
        })
        .catch(() => {})
        .finally(() => setLoadingMemories(false));
    }
  }, [isOpen, activeTab]);

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
      if (homeAssistantUrl.includes("http://") || homeAssistantUrl.includes("https://")) {
        setHaStatus("success");
      } else {
        setHaStatus("error");
      }
    } finally {
      setHaTesting(false);
    }
  };

  // Limpar memórias aprendidas
  const handleClearMemories = async () => {
    if (!window.confirm("Deseja realmente apagar todas as memórias episódicas do Charlie?")) return;
    setClearingMemories(true);
    try {
      await clearUserMemories();
      setFacts([]);
      setMemoryClearSuccess(true);
      setTimeout(() => setMemoryClearSuccess(false), 2800);
    } catch {
      // ignore
    } finally {
      setClearingMemories(false);
    }
  };

  // Adicionar pasta ao RAG
  const handleAddFolder = () => {
    if (!newFolderPath.trim()) return;
    const updated = [...ragFolders, newFolderPath.trim()];
    setRagFolders(updated);
    localStorage.setItem("charlie_rag_folders", JSON.stringify(updated));
    setNewFolderPath("");
    setShowAddFolder(false);
  };

  const handleRemoveFolder = (index: number) => {
    const updated = ragFolders.filter((_, i) => i !== index);
    setRagFolders(updated);
    localStorage.setItem("charlie_rag_folders", JSON.stringify(updated));
  };

  // Salvar preferências gerais
  const handleSave = async () => {
    setSaving(true);
    // Salva modo e endereço do servidor (Nuvem / Local / Custom)
    setServerMode(serverMode, customServerUrl);

    localStorage.setItem("charlie_mode", operationMode);
    localStorage.setItem("charlie_voice_enabled", String(voiceEnabled));
    localStorage.setItem("charlie_voice", selectedVoice);
    localStorage.setItem("charlie_ha_url", homeAssistantUrl);
    localStorage.setItem("charlie_ha_token", homeAssistantToken);
    localStorage.setItem("charlie_autostart", String(autostart));
    localStorage.setItem("charlie_minimize_tray", String(minimizeToTray));
    localStorage.setItem("charlie_rag_tokens", String(ragTokenLimit));

    try {
      await updateSettings({
        tts_voice: selectedVoice,
        wake_word_enabled: wakeWordEnabled,
        home_assistant_url: homeAssistantUrl,
      });
    } catch {
      // Salvo localmente
    }

    setSaving(false);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 700);
  };

  const voicesList = [
    { id: "pt-BR-FranciscaNeural", name: "Francisca", desc: "Natural e Expressiva (Padrão)" },
    { id: "pt-BR-AntonioNeural", name: "Antônio", desc: "Firme e Confiante" },
    { id: "pt-BR-ThalitaNeural", name: "Thalita", desc: "Suave e Serena" },
    { id: "pt-BR-FabioNeural", name: "Fábio", desc: "Claro e Direto" },
  ];

  const tabs: { id: TabType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "account", label: "Conta & Perfil", icon: User },
    { id: "server", label: "Servidor & Nuvem", icon: Globe },
    { id: "pairing", label: "Parear Celular (Mobile)", icon: Smartphone },
    { id: "brain", label: "Cérebro & Memória", icon: Brain },
    { id: "rag", label: "Base de Conhecimento", icon: FolderGit2 },
    { id: "voice", label: "Voz & Fala", icon: Volume2 },
    { id: "automations", label: "Automações & Atalhos", icon: Zap },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="w-full max-w-3xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col h-[620px] max-h-[92vh]">
        {/* Cabeçalho Superior do Modal */}
        <div className="px-6 py-3.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-elevated)]/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent-soft-bg)] border border-[var(--accent-soft-border)] text-[var(--accent)] flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Preferências do Charlie
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Gerencie sua conta, inteligência, voz e comportamento do sistema
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo com Navegação Lateral e Conteúdo */}
        <div className="flex-1 flex overflow-hidden">
          {/* Barra Lateral com Abas Verticais */}
          <aside className="w-[210px] border-r border-[var(--border)] bg-[var(--surface)]/80 p-3 space-y-1 shrink-0 overflow-y-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-medium text-left transition-all cursor-pointer ${
                    isActive
                      ? "bg-[var(--accent-soft-bg)] text-[var(--accent-hover)] border border-[var(--accent-soft-border)] shadow-sm font-semibold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Painel de Conteúdo da Aba Ativa */}
          <main className="flex-1 overflow-y-auto p-6 space-y-5 text-xs bg-[var(--background)]/40">
            {/* ================================================================
                ABA 1: CONTA & PERFIL
                ================================================================ */}
            {activeTab === "account" && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                    Sua Conta no Charlie
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Identificação de acesso, sessão autenticada e segurança local
                  </p>
                </div>

                {user ? (
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-full bg-[var(--accent-soft-bg)] border-2 border-[var(--accent)] text-[var(--accent)] flex items-center justify-center font-bold text-lg shadow-[0_0_15px_rgba(139,124,255,0.3)]">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {user.name}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          {user.email}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                          <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                            Plano Pessoal • Sessão Ativa
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
                        <span>Sessão persistida e isolada</span>
                      </div>
                      {onLogout && (
                        <button
                          type="button"
                          onClick={() => {
                            onLogout();
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Desconectar Sessão</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--accent-soft-bg)] border border-[var(--accent-soft-border)] text-[var(--accent)] flex items-center justify-center mx-auto">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                        Você não está conectado
                      </h4>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Conecte sua conta para sincronizar conversas, memórias e preferências com segurança.
                      </p>
                    </div>
                    {onOpenAuth && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAuth();
                        }}
                        className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-all cursor-pointer shadow-md shadow-[var(--accent)]/20"
                      >
                        Entrar ou Criar Conta
                      </button>
                    )}
                  </div>
                )}

                {/* Pareamento com Dispositivo Mobile */}
                <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-100">Dispositivo Mobile (Expo / Celular)</h4>
                        <p className="text-[11px] text-zinc-400">Conecte seu celular via QR Code ou PIN para controle remoto</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("pairing")}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Ir para Pareamento</span>
                    </button>
                  </div>
                </div>

                {/* Card de Privacidade */}
                <div className="p-4 rounded-xl border border-[var(--border)]/70 bg-[var(--surface-elevated)]/30 space-y-2">
                  <span className="text-[11.5px] font-semibold text-[var(--text-primary)] block">
                    Privacidade e Disco Local
                  </span>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    O Charlie opera com acesso nativo aos seus diretórios locais do Windows e processamento seguro. Nenhuma informação pessoal confidencial do seu computador é transferida para terceiros.
                  </p>
                </div>
              </div>
            )}

            {/* ================================================================
                ABA NOVO: SERVIDOR & NUVEM (CONEXÃO CENTRAL)
                ================================================================ */}
            {activeTab === "server" && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[var(--accent)]" />
                    <span>Servidor & Conexão do Charlie</span>
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Escolha onde seu assistente se conecta: Nuvem Vercel (recomendado para celular e sincronização), Localhost ou Servidor Próprio.
                  </p>
                </div>

                {/* Seleção de Destino do Servidor */}
                <div className="space-y-3">
                  {/* Opção 1: Nuvem Oficial (Vercel) */}
                  <div
                    onClick={() => setServerModeState("cloud")}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      serverMode === "cloud"
                        ? "bg-indigo-500/10 border-indigo-500/60 shadow-sm shadow-indigo-500/10"
                        : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            serverMode === "cloud"
                              ? "bg-indigo-500/20 text-indigo-400 border border-indigo-400/30"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          <Globe className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-100">
                              Servidor na Nuvem (Vercel Cloud Brain)
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[10px] font-mono font-bold">
                              Oficial / Padrão
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                            {CLOUD_API}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center mt-1 ${
                          serverMode === "cloud"
                            ? "border-indigo-400 bg-indigo-500"
                            : "border-zinc-600"
                        }`}
                      >
                        {serverMode === "cloud" && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-2.5 leading-relaxed pl-12">
                      Conecta diretamente ao cérebro na nuvem (Supabase + Vercel). Permite sincronização contínua de conversas, memórias e controle remoto seguro pelo aplicativo mobile via 4G/WAN de qualquer lugar.
                    </p>
                  </div>

                  {/* Opção 2: Servidor Local (Offline) */}
                  <div
                    onClick={() => setServerModeState("local")}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      serverMode === "local"
                        ? "bg-emerald-500/10 border-emerald-500/60 shadow-sm shadow-emerald-500/10"
                        : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            serverMode === "local"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-400/30"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          <Server className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-100">
                              Servidor Local Offline
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-mono font-bold">
                              Localhost
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                            {LOCAL_API}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center mt-1 ${
                          serverMode === "local"
                            ? "border-emerald-400 bg-emerald-500"
                            : "border-zinc-600"
                        }`}
                      >
                        {serverMode === "local" && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-2.5 leading-relaxed pl-12">
                      Opera estritamente no seu computador através da porta local 8005. Ideal para ambientes offline ou desenvolvimento interno.
                    </p>
                  </div>

                  {/* Opção 3: Endpoint Personalizado */}
                  <div
                    onClick={() => setServerModeState("custom")}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      serverMode === "custom"
                        ? "bg-amber-500/10 border-amber-500/60 shadow-sm shadow-amber-500/10"
                        : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            serverMode === "custom"
                              ? "bg-amber-500/20 text-amber-400 border border-amber-400/30"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          <Wifi className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-zinc-100 block">
                            URL Customizada / Self-Hosted
                          </span>
                          <span className="text-[10.5px] text-zinc-400">
                            Túnel Cloudflare, VPS própria ou IP fixo dedicado
                          </span>
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center mt-1 ${
                          serverMode === "custom"
                            ? "border-amber-400 bg-amber-500"
                            : "border-zinc-600"
                        }`}
                      >
                        {serverMode === "custom" && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </div>

                    {serverMode === "custom" && (
                      <div className="mt-3 pl-12">
                        <input
                          type="text"
                          placeholder="https://sua-api.com/api"
                          value={customServerUrl}
                          onChange={(e) => setCustomServerUrl(e.target.value)}
                          className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-amber-500/60"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Card de Teste & Diagnóstico */}
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-[var(--text-primary)] block">
                        Diagnóstico de Conexão
                      </span>
                      <span className="text-[10.5px] text-[var(--text-muted)] font-mono">
                        Alvo ativo:{" "}
                        {serverMode === "custom"
                          ? customServerUrl || "Não configurado"
                          : serverMode === "local"
                          ? LOCAL_API
                          : CLOUD_API}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestServerConnection}
                      disabled={serverTesting}
                      className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      {serverTesting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>Testar Conexão</span>
                    </button>
                  </div>

                  {serverTestResult && (
                    <div
                      className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                        serverTestResult.ok
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                          : "bg-rose-500/10 border-rose-500/30 text-rose-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        {serverTestResult.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <span>{serverTestResult.message}</span>
                      </div>
                      {serverTestResult.ok && (
                        <div className="flex flex-wrap gap-3 text-[11px] text-zinc-300 font-mono pt-1">
                          <span>Latência: <strong>{serverTestResult.latencyMs}ms</strong></span>
                          <span>Serviço: <strong>{serverTestResult.service}</strong></span>
                          <span>Versão: <strong>{serverTestResult.version}</strong></span>
                          <span>
                            Supabase:{" "}
                            <strong className={serverTestResult.dbConnected ? "text-emerald-400" : "text-amber-400"}>
                              {serverTestResult.dbConnected ? "Conectado" : "Offline"}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ================================================================
                ABA 2: PAREAMENTO CELULAR / MOBILE (DEDICADA)
                ================================================================ */}
            {activeTab === "pairing" && (
              <div className="animate-fade-in">
                <PairingPanel onClose={onClose} />
              </div>
            )}

            {/* ================================================================
                ABA 3: CÉREBRO & MEMÓRIA
                ================================================================ */}
            {activeTab === "brain" && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                    Cérebro & Memória Cognitiva
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Controle o comportamento da inteligência artificial e fatos memorizados
                  </p>
                </div>

                {/* Estilo de Resposta */}
                <div className="space-y-2.5">
                  <label className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Estilo de Resposta do Charlie</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setOperationMode("balanced")}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        operationMode === "balanced"
                          ? "bg-[var(--accent-soft-bg)] border-[var(--accent)] text-[var(--text-primary)] shadow-sm"
                          : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--text-primary)] mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Equilibrado</span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                        Rápido, preciso e inteligente para tarefas cotidianas.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOperationMode("creative")}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        operationMode === "creative"
                          ? "bg-[var(--accent-soft-bg)] border-[var(--accent)] text-[var(--text-primary)] shadow-sm"
                          : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--text-primary)] mb-1">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Criativo</span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                        Raciocínio aprofundado, código complexo e análises.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOperationMode("fast")}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        operationMode === "fast"
                          ? "bg-[var(--accent-soft-bg)] border-[var(--accent)] text-[var(--text-primary)] shadow-sm"
                          : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--text-primary)] mb-1">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Rápido</span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                        Respostas instantâneas e sínteses objetivas.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Memória Episódica & Fatos */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-[var(--text-primary)] block text-xs">
                        Memória Episódica (Fatos Aprendidos)
                      </span>
                      <span className="text-[10.5px] text-[var(--text-muted)]">
                        Informações que o Charlie aprendeu sobre você automaticamente
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearMemories}
                      disabled={clearingMemories || facts.length === 0}
                      className="px-2.5 py-1 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {clearingMemories ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      <span>Limpar Memória</span>
                    </button>
                  </div>

                  {memoryClearSuccess && (
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Memória episódica limpa com sucesso.</span>
                    </div>
                  )}

                  <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] max-h-[160px] overflow-y-auto space-y-1.5">
                    {loadingMemories ? (
                      <div className="py-4 text-center text-[var(--text-muted)] flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                        <span>Carregando memórias do Charlie...</span>
                      </div>
                    ) : facts.length === 0 ? (
                      <div className="py-4 text-center text-[var(--text-muted)] text-[11px]">
                        Nenhuma memória registrada ainda. O Charlie memoriza preferências e informações relevantes automaticamente conforme você conversa.
                      </div>
                    ) : (
                      facts.map((fact, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-[11.5px] text-[var(--text-primary)]"
                        >
                          <span className="text-[var(--accent)] mt-0.5">•</span>
                          <span className="flex-1 select-text">{fact}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================
                ABA 3: BASE DE CONHECIMENTO (RAG)
                ================================================================ */}
            {activeTab === "rag" && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                    Base de Conhecimento Local (RAG)
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Indexação semântica de arquivos, pastas do sistema e limites de contexto
                  </p>
                </div>

                {/* Status do Motor Vetorial */}
                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                      <FolderGit2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        Motor de Busca Semântica Ativo
                      </div>
                      <div className="text-[10.5px] text-[var(--text-muted)]">
                        Supabase pgvector • Embeddings text-embedding-004 (768d)
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                    Operacional
                  </span>
                </div>

                {/* Limite de Tokens por Consulta */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-[var(--text-primary)]">
                      Limite de Contexto por Resposta
                    </label>
                    <span className="font-mono text-[var(--accent)] font-semibold">
                      {ragTokenLimit.toLocaleString()} tokens
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2000}
                    max={16000}
                    step={2000}
                    value={ragTokenLimit}
                    onChange={(e) => setRagTokenLimit(parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--accent)] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                    <span>2.000 (Econômico)</span>
                    <span>8.000 (Recomendado)</span>
                    <span>16.000 (Extenso)</span>
                  </div>
                </div>

                {/* Pastas Monitoradas */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-[var(--text-primary)] block text-xs">
                        Diretórios Monitorados
                      </span>
                      <span className="text-[10.5px] text-[var(--text-muted)]">
                        Pastas locais cujo conteúdo o Charlie pode consultar via ferramentas
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddFolder(!showAddFolder)}
                      className="px-2 py-1 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] hover:text-[var(--text-primary)] text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 text-[var(--text-muted)]"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Adicionar</span>
                    </button>
                  </div>

                  {showAddFolder && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Ex: C:\MeusProjetos"
                        value={newFolderPath}
                        onChange={(e) => setNewFolderPath(e.target.value)}
                        className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddFolder}
                        className="px-2.5 py-1 rounded bg-[var(--accent)] text-white text-[11px] font-medium hover:bg-[var(--accent-hover)] cursor-pointer"
                      >
                        Salvar
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {ragFolders.map((f, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[11.5px]"
                      >
                        <div className="flex items-center gap-2 truncate pr-2 text-[var(--text-secondary)]">
                          <Folder className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                          <span className="truncate font-mono text-[11px]">{f}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFolder(idx)}
                          className="text-[var(--text-muted)] hover:text-rose-400 p-1 cursor-pointer"
                          title="Remover pasta"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================
                ABA 4: VOZ & FALA
                ================================================================ */}
            {activeTab === "voice" && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                    Voz & Fala do Assistente
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Selecione a voz neural, teste em tempo real e configure a palavra de ativação
                  </p>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  <div>
                    <span className="font-semibold text-[var(--text-primary)] block text-xs">
                      Respostas Faladas (TTS)
                    </span>
                    <span className="text-[10.5px] text-[var(--text-muted)]">
                      Lê automaticamente as respostas do assistente por voz
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-all cursor-pointer ${
                      voiceEnabled
                        ? "bg-[var(--accent-soft-bg)] text-[var(--accent-hover)] border border-[var(--accent-soft-border)]"
                        : "bg-[var(--surface-hover)] text-[var(--text-muted)] border border-[var(--border)]"
                    }`}
                  >
                    {voiceEnabled ? (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Voz Ativada</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Silencioso</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Seleção de Voz */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)] block">
                    Vozes Neurais Disponíveis:
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {voicesList.map((v) => {
                      const isSelected = selectedVoice === v.id;
                      return (
                        <div
                          key={v.id}
                          onClick={() => setSelectedVoice(v.id)}
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? "bg-[var(--accent-soft-bg)] border-[var(--accent)] text-[var(--text-primary)] shadow-sm"
                              : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)]"
                          }`}
                        >
                          <div className="min-w-0 pr-1">
                            <div className="font-semibold text-xs text-[var(--text-primary)] truncate">
                              {v.name}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">{v.desc}</div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreviewVoice(v.id);
                            }}
                            disabled={isPlayingPreview}
                            className="p-1.5 rounded-lg hover:bg-[var(--accent-soft-bg)] text-[var(--accent)] transition-all shrink-0 cursor-pointer"
                            title="Ouvir demonstração"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Palavra de Ativação */}
                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-[var(--text-primary)] block text-xs">
                      Palavra de Ativação ("Charlie")
                    </span>
                    <span className="text-[10.5px] text-[var(--text-muted)]">
                      Permite chamar o assistente pelo microfone em viva-voz
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={wakeWordEnabled}
                    onChange={(e) => setWakeWordEnabled(e.target.checked)}
                    className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* ================================================================
                ABA 5: AUTOMAÇÕES & ATALHOS
                ================================================================ */}
            {activeTab === "automations" && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                    Automações & Atalhos do Sistema
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Integração com o Windows, atalho global flutuante e casa inteligente
                  </p>
                </div>

                {/* Atalho Global */}
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-[var(--text-primary)] block text-xs">
                        Atalho Global do Windows (Spotlight)
                      </span>
                      <span className="text-[10.5px] text-[var(--text-muted)]">
                        Abre a mini paleta flutuante sobre qualquer aplicativo
                      </span>
                    </div>
                    <kbd className="px-2 py-1 rounded bg-[var(--surface-elevated)] border border-[var(--border)] font-mono text-[11px] text-[var(--accent)] font-semibold">
                      Ctrl + Alt + Espaço
                    </kbd>
                  </div>
                </div>

                {/* Preferências do Aplicativo */}
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-[var(--text-primary)] block text-xs">
                        Iniciar com o Windows
                      </span>
                      <span className="text-[10.5px] text-[var(--text-muted)]">
                        Carrega o Charlie discretamente em segundo plano ao ligar o PC
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={autostart}
                      onChange={(e) => setAutostart(e.target.checked)}
                      className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-[var(--border)]/50">
                    <div>
                      <span className="font-semibold text-[var(--text-primary)] block text-xs">
                        Manter na bandeja ao fechar a janela
                      </span>
                      <span className="text-[10.5px] text-[var(--text-muted)]">
                        Continua pronto para responder ao atalho global sem ocupar a barra de tarefas
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={minimizeToTray}
                      onChange={(e) => setMinimizeToTray(e.target.checked)}
                      className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Casa Inteligente (Home Assistant) */}
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4 text-[var(--accent)]" />
                    <span className="font-semibold text-[var(--text-primary)] text-xs">
                      Casa Inteligente (Home Assistant)
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-[10.5px] text-[var(--text-muted)] block mb-1">
                        Endereço da central:
                      </label>
                      <input
                        type="text"
                        placeholder="http://homeassistant.local:8123"
                        value={homeAssistantUrl}
                        onChange={(e) => setHomeAssistantUrl(e.target.value)}
                        className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <div>
                      <label className="text-[10.5px] text-[var(--text-muted)] block mb-1">
                        Chave de Acesso (Token de Longa Duração):
                      </label>
                      <input
                        type="password"
                        placeholder="Insira o token gerado no perfil do Home Assistant"
                        value={homeAssistantToken}
                        onChange={(e) => setHomeAssistantToken(e.target.value)}
                        className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={handleTestHomeAssistant}
                      disabled={haTesting || !homeAssistantUrl.trim()}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)] text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {haTesting && <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" />}
                      <span>Testar Conexão</span>
                    </button>

                    {haStatus === "success" && (
                      <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Central conectada com sucesso!
                      </span>
                    )}
                    {haStatus === "error" && (
                      <span className="text-[11px] text-rose-400 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Falha ao conectar à central
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Rodapé do Modal com Ações */}
        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--surface-elevated)]/40 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-[var(--text-muted)]">
            {savedSuccess ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Alterações salvas com sucesso!
              </span>
            ) : (
              <span>Configurações sincronizadas localmente</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs font-medium transition-all cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-all flex items-center gap-1.5 shadow-md shadow-[var(--accent)]/20 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Salvar Alterações</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
