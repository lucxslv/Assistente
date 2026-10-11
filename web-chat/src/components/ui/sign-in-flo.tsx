"use client";

import React, { useState, useEffect, useRef, useId } from "react";
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, CheckCircle2, KeyRound, ArrowLeft } from "lucide-react";
import { LoginCredentials, RegisterCredentials } from "../../types/auth";
import { AuthService } from "../../services/authService";

/*
 * Página oficial de autenticação própria do Charlie (sign-in-flo):
 * - Login, Cadastro e Recuperação de Senha (solicitação + redefinição com token de uso único).
 * - Autenticação própria sem OAuth social externo.
 */

interface FormFieldProps {
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon: React.ReactNode;
  showToggle?: boolean;
  onToggle?: () => void;
  showPassword?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  name?: string;
}

const AnimatedFormField: React.FC<FormFieldProps> = ({
  type,
  placeholder,
  value,
  onChange,
  icon,
  showToggle,
  onToggle,
  showPassword,
  disabled,
  autoComplete,
  name,
}) => {
  const inputId = useId();
  const [isFocused, setIsFocused] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div className="relative group">
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-background transition-all duration-300 ease-in-out focus-within:border-primary/60"
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="absolute left-3 top-9 -translate-y-1/2 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary">
          {icon}
        </div>

        <input
          type={type}
          id={inputId}
          name={name ?? autoComplete ?? type}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-label={placeholder}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full bg-transparent pl-10 pr-12 pt-6 pb-2 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          placeholder=""
        />

        <label
          htmlFor={inputId}
          className={`absolute left-10 transition-all duration-200 ease-in-out pointer-events-none ${
            isFocused || value
              ? "top-2 text-xs text-primary font-medium"
              : "top-9 -translate-y-1/2 text-sm text-muted-foreground"
          }`}
        >
          {placeholder}
        </label>

        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
            title={showPassword ? "Ocultar senha" : "Exibir senha"}
            className="absolute right-3 top-9 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}

        {isHovering && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(200px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59, 130, 246, 0.1) 0%, transparent 70%)`,
            }}
          />
        )}
      </div>
    </div>
  );
};

const FloatingParticles: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const canvasEl = canvas;

    const setCanvasSize = () => {
      canvasEl.width = window.innerWidth;
      canvasEl.height = window.innerHeight;
    };

    setCanvasSize();
    window.addEventListener("resize", setCanvasSize);

    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;

      constructor() {
        this.x = Math.random() * canvasEl.width;
        this.y = Math.random() * canvasEl.height;
        this.size = Math.random() * 2 + 1;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.opacity = Math.random() * 0.3;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x > canvasEl.width) this.x = 0;
        if (this.x < 0) this.x = canvasEl.width;
        if (this.y > canvasEl.height) this.y = 0;
        if (this.y < 0) this.y = canvasEl.height;
      }

      draw() {
        if (!ctx) return;
        ctx.fillStyle = `rgba(59, 130, 246, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const particles: Particle[] = [];
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    let animationFrameId = 0;

    const animate = () => {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", setCanvasSize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
};

export interface SignInFloProps {
  onLogin: (creds: LoginCredentials) => Promise<unknown>;
  onRegister: (creds: RegisterCredentials) => Promise<unknown>;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
}

type AuthViewMode = "login" | "signup" | "forgot" | "reset";

export const Component: React.FC<SignInFloProps> = ({
  onLogin,
  onRegister,
  isLoading,
  error,
  onClearError,
}) => {
  const [viewMode, setViewMode] = useState<AuthViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [localValidation, setLocalValidation] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);

  const switchMode = (nextMode: AuthViewMode) => {
    setViewMode(nextMode);
    setLocalValidation(null);
    setSuccessNotice(null);
    onClearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || isRecoverySubmitting) return;

    onClearError();
    setLocalValidation(null);
    setSuccessNotice(null);

    if (viewMode === "forgot") {
      const cleanEmail = email.trim();
      if (!cleanEmail || !cleanEmail.includes("@")) {
        setLocalValidation("Por favor, informe um endereço de e-mail válido.");
        return;
      }
      setIsRecoverySubmitting(true);
      try {
        const res = await AuthService.forgotPassword(cleanEmail);
        setSuccessNotice(
          res.message ||
            "Se o e-mail estiver cadastrado, enviamos as instruções de recuperação."
        );
        if (res.reset_token_dev) {
          setResetToken(res.reset_token_dev);
        }
        setViewMode("reset");
      } catch (err: unknown) {
        setLocalValidation(
          (err as Error)?.message || "Não foi possível processar a solicitação."
        );
      } finally {
        setIsRecoverySubmitting(false);
      }
      return;
    }

    if (viewMode === "reset") {
      const cleanToken = resetToken.trim();
      if (!cleanToken || cleanToken.length < 8) {
        setLocalValidation("Informe o código/token de recuperação recebido.");
        return;
      }
      if (newPassword.length < 6) {
        setLocalValidation("A nova senha deve conter pelo menos 6 caracteres.");
        return;
      }
      setIsRecoverySubmitting(true);
      try {
        const res = await AuthService.resetPassword(cleanToken, newPassword);
        setSuccessNotice(
          res.message || "Senha redefinida com sucesso! Faça login com sua nova senha."
        );
        setPassword("");
        setNewPassword("");
        setResetToken("");
        setViewMode("login");
      } catch (err: unknown) {
        setLocalValidation(
          (err as Error)?.message || "Token inválido ou expirado."
        );
      } finally {
        setIsRecoverySubmitting(false);
      }
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setLocalValidation("Por favor, informe um endereço de e-mail válido.");
      return;
    }

    if (password.length < 6) {
      setLocalValidation("A senha deve conter o mínimo de 6 caracteres.");
      return;
    }

    if (viewMode === "signup" && !name.trim()) {
      setLocalValidation("Por favor, informe seu nome completo.");
      return;
    }

    try {
      if (viewMode === "signup") {
        await onRegister({ name: name.trim(), email: cleanEmail, password });
      } else {
        await onLogin({ email: cleanEmail, password });
      }
    } catch {
      // Erro tratado pelo hook useAuth (exibido via prop `error`)
    }
  };

  const activeError = localValidation || error;
  const busy = isLoading || isRecoverySubmitting;

  return (
    <div className="h-[var(--app-height,100dvh)] w-full bg-background text-foreground flex items-center justify-center p-4 relative overflow-y-auto overflow-x-hidden select-none font-sans pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <FloatingParticles />

      <div className="relative z-10 w-full max-w-md my-auto">
        <div className="bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-black border border-white/[0.08] rounded-2xl mb-4 p-2.5 shadow-glow-sm">
              <img src="/logo.png" alt="Charlie AI" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1.5">
              {viewMode === "signup"
                ? "Criar Conta"
                : viewMode === "forgot"
                ? "Recuperar Senha"
                : viewMode === "reset"
                ? "Redefinir Senha"
                : "Bem-vindo ao Charlie"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {viewMode === "signup"
                ? "Cadastre sua conta pessoal para começar"
                : viewMode === "forgot"
                ? "Informe seu e-mail para gerar um token de uso único"
                : viewMode === "reset"
                ? "Insira o token de recuperação e defina sua nova senha"
                : "Entre com suas credenciais para acessar seu workspace"}
            </p>
          </div>

          {activeError && (
            <div className="mb-5 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-xs text-red-400 animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
              <span className="flex-1">{activeError}</span>
            </div>
          )}

          {successNotice && (
            <div className="mb-5 flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
              <span className="flex-1">{successNotice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {viewMode === "signup" && (
              <AnimatedFormField
                type="text"
                name="name"
                placeholder="Nome Completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                icon={<User size={18} />}
                disabled={busy}
                autoComplete="name"
              />
            )}

            {(viewMode === "login" || viewMode === "signup" || viewMode === "forgot") && (
              <AnimatedFormField
                type="email"
                name="email"
                placeholder="Endereço de E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Mail size={18} />}
                disabled={busy}
                autoComplete="email"
              />
            )}

            {(viewMode === "login" || viewMode === "signup") && (
              <AnimatedFormField
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock size={18} />}
                showToggle
                onToggle={() => setShowPassword(!showPassword)}
                showPassword={showPassword}
                disabled={busy}
                autoComplete={viewMode === "signup" ? "new-password" : "current-password"}
              />
            )}

            {viewMode === "reset" && (
              <>
                <AnimatedFormField
                  type="text"
                  name="reset_token"
                  placeholder="Token de Recuperação"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  icon={<KeyRound size={18} />}
                  disabled={busy}
                  autoComplete="one-time-code"
                />
                <AnimatedFormField
                  type={showPassword ? "text" : "password"}
                  name="new_password"
                  placeholder="Nova Senha (mín. 6 caracteres)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  icon={<Lock size={18} />}
                  showToggle
                  onToggle={() => setShowPassword(!showPassword)}
                  showPassword={showPassword}
                  disabled={busy}
                  autoComplete="new-password"
                />
              </>
            )}

            {viewMode === "login" && (
              <div className="flex items-center justify-between">
                <label htmlFor="remember-me" className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    id="remember-me"
                    name="remember-me"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 accent-primary bg-background border-border rounded focus:ring-primary focus:ring-2"
                  />
                  <span className="text-sm text-muted-foreground">Manter sessão ativa</span>
                </label>

                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-sm text-primary hover:underline cursor-pointer"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full relative group bg-primary text-primary-foreground py-3 px-4 rounded-lg font-medium transition-all duration-300 ease-in-out hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden cursor-pointer"
            >
              <span className={`transition-opacity duration-200 ${busy ? "opacity-0" : "opacity-100"}`}>
                {viewMode === "signup"
                  ? "Criar Conta"
                  : viewMode === "forgot"
                  ? "Gerar Token de Recuperação"
                  : viewMode === "reset"
                  ? "Confirmar Nova Senha"
                  : "Entrar"}
              </span>

              {busy && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
            </button>
          </form>

          <div className="mt-7 pt-5 border-t border-border text-center space-y-2">
            {viewMode === "forgot" || viewMode === "reset" ? (
              <div className="flex flex-col items-center gap-2">
                {viewMode === "forgot" && (
                  <button
                    type="button"
                    onClick={() => switchMode("reset")}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                  >
                    Já possui um código de recuperação? Inserir token
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar para o login</span>
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {viewMode === "signup" ? "Já possui uma conta?" : "Ainda não tem uma conta?"}{" "}
                <button
                  type="button"
                  onClick={() => switchMode(viewMode === "signup" ? "login" : "signup")}
                  className="text-primary hover:underline font-medium cursor-pointer"
                >
                  {viewMode === "signup" ? "Entrar" : "Cadastre-se"}
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
