import React, { useState } from "react";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Minus,
  Square,
  X,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { loginUser, registerUser, loginAsGuest, UserProfile } from "../services/api";
import { invoke } from "@tauri-apps/api/core";

interface AuthGatekeeperProps {
  onSuccess: (user: UserProfile) => void;
}

export const AuthGatekeeper: React.FC<AuthGatekeeperProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleMinimize = async () => {
    try {
      await invoke("minimize_window");
    } catch {
      // ignore
    }
  };

  const handleToggleMaximize = async () => {
    try {
      await invoke("toggle_maximize_window");
    } catch {
      // ignore
    }
  };

  const handleClose = async () => {
    try {
      await invoke("close_window");
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Por favor, informe um endereço de e-mail válido.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    if (mode === "register") {
      if (!name.trim()) {
        setError("Por favor, informe seu nome ou como prefere ser chamado.");
        return;
      }
      if (password !== confirmPassword) {
        setError("As senhas não coincidem. Digite a mesma senha nos dois campos.");
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === "register") {
        const res = await registerUser(name.trim(), cleanEmail, password);
        setSuccessMsg("Conta criada com sucesso! Inicializando seu assistente...");
        setTimeout(() => {
          onSuccess(res.user);
        }, 900);
      } else {
        const res = await loginUser(cleanEmail, password);
        setSuccessMsg("Login realizado com sucesso! Bem-vindo de volta.");
        setTimeout(() => {
          onSuccess(res.user);
        }, 600);
      }
    } catch (err: any) {
      const msg = err?.message || "Falha na autenticação. Verifique os dados e tente novamente.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);
    try {
      const res = await loginAsGuest();
      setSuccessMsg("Acessando como Lucas no modo local...");
      setTimeout(() => {
        onSuccess(res.user);
      }, 500);
    } catch (err: any) {
      setError(err?.message || "Falha ao iniciar modo local.");
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="flex flex-col h-screen w-screen bg-[#0E0F12] text-[#F2F3F5] font-sans select-none overflow-hidden relative">
      {/* Barra de Título Nativa com Controles de Janela */}
      <header
        data-tauri-drag-region
        className="h-10 border-b border-[var(--border)] flex items-center justify-between px-4 bg-[#0E0F12] shrink-0 z-20"
      >
        <div data-tauri-drag-region className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-default">
          <img
            src="/charlie-logo.svg"
            alt="Charlie"
            className="w-4 h-4 object-contain opacity-90 drop-shadow-[0_0_8px_rgba(139,124,255,0.4)]"
          />
          <span className="font-semibold text-[var(--text-secondary)]">Charlie Desktop</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleMinimize}
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            title="Minimizar"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            title="Maximizar"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/15 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Fundo com Brilho Suave */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[var(--accent)]/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Conteúdo Central do Gatekeeper */}
      <main className="flex-1 flex items-center justify-center p-6 z-10 overflow-y-auto">
        <div className="w-full max-w-[420px] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] p-7 flex flex-col animate-scale-in">
          {/* Logo Principal e Título */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border)] flex items-center justify-center mx-auto mb-4 shadow-[0_0_35px_rgba(139,124,255,0.25)] p-3">
              <img
                src="/charlie-logo.svg"
                alt="Charlie"
                className="w-full h-full object-contain drop-shadow-[0_0_12px_rgba(139,124,255,0.6)]"
              />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Charlie
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {mode === "login"
                ? "Entre com sua conta para acessar seu assistente"
                : "Crie sua conta para começar a usar o Charlie"}
            </p>
          </div>

          {/* Abas Alternadoras (Entrar / Criar Conta) */}
          <div className="grid grid-cols-2 p-1 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border)] mb-5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === "register"
                  ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Criar Conta
            </button>
          </div>

          {/* Alertas de Erro / Sucesso */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs flex items-center gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Formulário de Autenticação */}
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {mode === "register" && (
              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                  Como quer ser chamado:
                </label>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl focus-within:border-[var(--accent)] transition-colors">
                  <User className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  <input
                    type="text"
                    required
                    placeholder="Seu nome ou apelido"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] text-xs"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                E-mail:
              </label>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl focus-within:border-[var(--accent)] transition-colors">
                <Mail className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                <input
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                Senha:
              </label>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl focus-within:border-[var(--accent)] transition-colors">
                <Lock className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Mínimo de 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === "register" && (
              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                  Confirme a Senha:
                </label>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl focus-within:border-[var(--accent)] transition-colors">
                  <Lock className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Repita sua senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] text-xs"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 mt-2 rounded-xl bg-[var(--accent)] text-white font-semibold hover:bg-[var(--accent-hover)] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[var(--accent)]/20 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : mode === "login" ? (
                <>
                  <span>Entrar no Charlie</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Criar Conta e Começar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-[var(--border)]"></div>
              <span className="flex-shrink mx-3 text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">ou</span>
              <div className="flex-grow border-t border-[var(--border)]"></div>
            </div>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleGuestLogin}
              className="w-full py-2.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] hover:border-[var(--accent)]/50 text-[var(--text-primary)] hover:text-white font-medium transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm text-xs hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Continuar como Lucas (Modo Local / Convidado)</span>
            </button>
          </form>

          {/* Garantia de Privacidade */}
          <div className="mt-6 pt-4 border-t border-[var(--border)]/60 flex items-center justify-center gap-1.5 text-[10.5px] text-[var(--text-muted)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Sessão persistida e segura no computador</span>
          </div>
        </div>
      </main>
    </div>
  );
};
