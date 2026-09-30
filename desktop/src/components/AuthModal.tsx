import React, { useState } from "react";
import {
  X,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { loginUser, registerUser, UserProfile } from "../services/api";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  initialMode?: "login" | "register";
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = "login",
}) => {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

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
        setError("Por favor, digite seu nome ou como prefere ser chamado.");
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
        setSuccessMsg("Conta criada com sucesso! Carregando seu assistente...");
        setTimeout(() => {
          onSuccess(res.user);
          onClose();
        }, 1200);
      } else {
        const res = await loginUser(cleanEmail, password);
        setSuccessMsg("Login realizado com sucesso! Bem-vindo de volta.");
        setTimeout(() => {
          onSuccess(res.user);
          onClose();
        }, 800);
      }
    } catch (err: any) {
      const msg = err?.message || "Ocorreu um erro ao processar sua solicitação.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[0_25px_70px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col ring-1 ring-[var(--accent)]/20 animate-scale-in text-[var(--text-primary)]"
      >
        {/* Cabeçalho */}
        <div className="relative px-6 pt-6 pb-4 border-b border-[var(--border)] bg-[var(--surface-elevated)]/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--accent-soft-bg)] border border-[var(--accent-soft-border)] text-[var(--accent)] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {mode === "login" ? "Entrar no Charlie" : "Criar sua Conta"}
              </h2>
              <p className="text-[12px] text-[var(--text-muted)]">
                {mode === "login"
                  ? "Acesse suas conversas e memórias personalizadas"
                  : "Comece sua experiência com inteligência sob medida"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas Alternadoras (Entrar vs Cadastrar) */}
        <div className="grid grid-cols-2 p-1.5 bg-[var(--background)] border-b border-[var(--border)] text-[13px] font-medium">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`py-2 rounded-[var(--radius-sm)] transition-all cursor-pointer ${
              mode === "login"
                ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm font-semibold border border-[var(--border)]"
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
            }}
            className={`py-2 rounded-[var(--radius-sm)] transition-all cursor-pointer ${
              mode === "register"
                ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm font-semibold border border-[var(--border)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            Criar Conta
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 text-left">
          {error && (
            <div className="p-3 rounded-[var(--radius-sm)] bg-red-500/10 border border-red-500/30 text-red-300 text-[12px] leading-relaxed animate-fade-in flex items-start gap-2">
              <span className="text-red-400 font-bold shrink-0">!</span>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-[var(--radius-sm)] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[12px] leading-relaxed animate-fade-in flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === "register" && (
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                Seu Nome Completo
              </label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-[var(--text-muted)] absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Como o Charlie deve te chamar?"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Endereço de E-mail
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-[var(--text-muted)] absolute left-3 pointer-events-none" />
              <input
                type="email"
                required
                autoFocus={mode === "login"}
                placeholder="seu.email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Senha de Acesso
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3 pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="No mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                title={showPassword ? "Ocultar senha" : "Ver senha"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === "register" && (
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                Confirmar Senha
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Repita sua senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-2.5 px-4 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-[13px] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[var(--accent)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processando...</span>
              </>
            ) : mode === "login" ? (
              <>
                <span>Entrar na Conta</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Criar Conta e Iniciar</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-[12px]">
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              Continuar como convidado
            </button>

            <span className="text-[11px] text-[var(--text-muted)]">
              Protegido por Supabase Auth
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};
