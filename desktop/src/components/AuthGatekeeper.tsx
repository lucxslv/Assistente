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
  KeyRound,
} from "lucide-react";
import {
  loginUser,
  registerUser,
  loginAsGuest,
  requestPasswordReset,
  confirmPasswordReset,
  UserProfile,
} from "../services/api";
import { invoke } from "@tauri-apps/api/core";

interface AuthGatekeeperProps {
  onSuccess: (user: UserProfile) => void;
}

export const AuthGatekeeper: React.FC<AuthGatekeeperProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
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
    if (mode !== "reset" && (!cleanEmail || !cleanEmail.includes("@"))) {
      setError("Por favor, informe um endereço de e-mail válido.");
      return;
    }

    if (mode === "forgot") {
      setIsLoading(true);
      try {
        const res = await requestPasswordReset(cleanEmail);
        if (res.reset_token) {
          setResetToken(res.reset_token);
        }
        setSuccessMsg(res.message || "Se o e-mail estiver cadastrado, enviamos as instruções de redefinição.");
        setMode("reset");
      } catch (err: any) {
        setError(err?.message || "Não foi possível processar a recuperação de senha.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (mode === "reset") {
      if (!resetToken.trim()) {
        setError("Informe o código de redefinição.");
        return;
      }
      if (password.length < 6) {
        setError("A nova senha deve conter no mínimo 6 caracteres.");
        return;
      }
      if (password !== confirmPassword) {
        setError("As senhas não coincidem.");
        return;
      }
      setIsLoading(true);
      try {
        const res = await confirmPasswordReset(resetToken.trim(), password);
        setSuccessMsg(res.message || "Senha redefinida com sucesso! Faça login com sua nova senha.");
        setPassword("");
        setConfirmPassword("");
        setResetToken("");
        setMode("login");
      } catch (err: any) {
        setError(err?.message || "Código inválido ou expirado.");
      } finally {
        setIsLoading(false);
      }
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
      setSuccessMsg("Acessando modo convidado...");
      setTimeout(() => {
        onSuccess(res.user);
      }, 500);
    } catch (err: any) {
      setError(err?.message || "Falha ao iniciar sessão.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-[#F2F3F5] font-sans select-none overflow-hidden relative">
      {/* Barra de Título Nativa com Controles de Janela */}
      <header
        data-tauri-drag-region
        className="h-10 border-b border-white/[0.06] flex items-center justify-between px-4 bg-black shrink-0 z-20"
      >
        <div data-tauri-drag-region className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-default">
          <img
            src="/logo.png"
            alt="Charlie"
            className="w-4 h-4 object-contain object-center"
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
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[320px] bg-white/[0.02] blur-[80px] rounded-full pointer-events-none" />

      {/* Conteúdo Central do Gatekeeper */}
      <main className="flex-1 flex items-center justify-center p-6 z-10 overflow-y-auto">
        <div className="w-full max-w-[420px] bg-[#0E0E10] border border-white/[0.07] rounded-[18px] shadow-[0_16px_64px_-12px_rgba(0,0,0,0.85)] p-7 flex flex-col animate-fade-in">
          {/* Logo Principal e Título */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-black border border-white/[0.08] flex items-center justify-center mx-auto mb-4 overflow-hidden p-2.5">
              <img
                src="/logo.png"
                alt="Charlie"
                className="w-full h-full object-contain object-center"
              />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Charlie
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {mode === "login"
                ? "Entre com sua conta para acessar seu assistente"
                : mode === "register"
                ? "Crie sua conta para começar a usar o Charlie"
                : mode === "forgot"
                ? "Recupere o acesso à sua conta"
                : "Defina uma nova senha para sua conta"}
            </p>
          </div>

          {/* Abas Alternadoras (Entrar / Criar Conta) */}
          {(mode === "login" || mode === "register") && (
            <div className="grid grid-cols-2 p-1 bg-white/[0.04] rounded-[14px] border border-white/[0.06] mb-5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg transition-all cursor-pointer ${
                  mode === "login"
                    ? "bg-white text-black shadow-sm"
                    : "text-white/50 hover:text-white"
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
                    ? "bg-white text-black shadow-sm"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Criar Conta
              </button>
            </div>
          )}

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
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1A1A1E] border border-white/[0.06] rounded-[12px] focus-within:border-white/[0.14] focus-within:bg-[#222224] transition-colors">
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

            {mode !== "reset" && (
              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                  E-mail:
                </label>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1A1A1E] border border-white/[0.06] rounded-[12px] focus-within:border-white/[0.14] focus-within:bg-[#222224] transition-colors">
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
            )}

            {mode === "reset" && (
              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                  Código de Redefinição:
                </label>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1A1A1E] border border-white/[0.06] rounded-[12px] focus-within:border-white/[0.14] focus-within:bg-[#222224] transition-colors">
                  <KeyRound className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  <input
                    type="text"
                    required
                    placeholder="Cole o código de redefinição"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="w-full bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                    {mode === "reset" ? "Nova Senha:" : "Senha:"}
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                        setSuccessMsg(null);
                      }}
                      className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1A1A1E] border border-white/[0.06] rounded-[12px] focus-within:border-white/[0.14] focus-within:bg-[#222224] transition-colors">
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
            )}

            {(mode === "register" || mode === "reset") && (
              <div>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                  Confirme a Senha:
                </label>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1A1A1E] border border-white/[0.06] rounded-[12px] focus-within:border-white/[0.14] focus-within:bg-[#222224] transition-colors">
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
              className="w-full py-2.5 mt-2 rounded-[14px] bg-white text-black font-semibold hover:bg-white/90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : mode === "login" ? (
                <>
                  <span>Entrar no Charlie</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : mode === "register" ? (
                <>
                  <span>Criar Conta e Começar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : mode === "forgot" ? (
                <>
                  <span>Gerar Código de Recuperação</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Redefinir Senha</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {(mode === "forgot" || mode === "reset") && (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setSuccessMsg(null);
                }}
                className="w-full py-2 text-center text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Voltar para o login
              </button>
            )}

            {(mode === "login" || mode === "register") && (
              <>
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-[var(--border)]"></div>
                  <span className="flex-shrink mx-3 text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wider">ou</span>
                  <div className="flex-grow border-t border-[var(--border)]"></div>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleGuestLogin}
                  className="w-full py-2.5 rounded-[14px] bg-[#1E1E20] border border-white/[0.06] hover:border-white/[0.10] text-white hover:text-white font-medium transition-all flex items-center justify-center gap-2 cursor-pointer text-xs hover:bg-[#222224] disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Continuar como Convidado</span>
                </button>
              </>
            )}
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
