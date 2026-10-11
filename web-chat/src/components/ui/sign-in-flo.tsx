"use client";

import React, { useState, useEffect, useRef, useId } from "react";
import { Eye, EyeOff, Mail, Lock, User, AlertCircle } from "lucide-react";
import { LoginCredentials, RegisterCredentials } from "../../types/auth";

/*
 * Página de login/cadastro (sign-in-flo) — design flutuante com partículas,
 * campos animados e botões sociais. Integrada ao fluxo real de autenticação
 * do Charlie (useAuth -> AuthService -> API).
 *
 * Observações de integração:
 * - lucide-react v1.x removeu os ícones de marca (Github/Twitter/Linkedin),
 *   então os logos sociais são SVGs inline.
 * - "Lembrar de mim" é apenas visual (a sessão persiste via StorageService).
 * - Os botões sociais são decorativos (não há OAuth no backend).
 */

interface GithubIconProps {
  size?: number;
}

const GithubIcon: React.FC<GithubIconProps> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const TwitterXIcon: React.FC<GithubIconProps> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);

const LinkedinIcon: React.FC<GithubIconProps> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
  </svg>
);

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
  name
}) => {
  const inputId = useId();
  const [isFocused, setIsFocused] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
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

        <label htmlFor={inputId} className={`absolute left-10 transition-all duration-200 ease-in-out pointer-events-none ${
          isFocused || value
            ? 'top-2 text-xs text-primary font-medium'
            : 'top-9 -translate-y-1/2 text-sm text-muted-foreground'
        }`}>
          {placeholder}
        </label>

        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
            title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
            className="absolute right-3 top-9 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}

        {isHovering && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(200px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59, 130, 246, 0.1) 0%, transparent 70%)`
            }}
          />
        )}
      </div>
    </div>
  );
};

const SocialButton: React.FC<{ icon: React.ReactNode; name: string }> = ({ icon, name }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      className="relative group p-3 rounded-lg border border-border bg-background hover:bg-accent transition-all duration-300 ease-in-out overflow-hidden cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 transition-transform duration-500 ${
        isHovered ? 'translate-x-0' : '-translate-x-full'
      }`} />
      <div className="relative text-foreground group-hover:text-primary transition-colors">
        {icon}
      </div>
    </button>
  );
};

const FloatingParticles: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasEl = canvas;

    const setCanvasSize = () => {
      canvasEl.width = window.innerWidth;
      canvasEl.height = window.innerHeight;
    };

    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

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

      particles.forEach(particle => {
        particle.update();
        particle.draw();
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', setCanvasSize);
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

export const Component: React.FC<SignInFloProps> = ({
  onLogin,
  onRegister,
  isLoading,
  error,
  onClearError,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [localValidation, setLocalValidation] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    onClearError();
    setLocalValidation(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setLocalValidation('Por favor, informe um endereço de e-mail válido.');
      return;
    }

    if (password.length < 6) {
      setLocalValidation('A senha deve conter o mínimo de 6 caracteres.');
      return;
    }

    if (isSignUp && !name.trim()) {
      setLocalValidation('Por favor, informe seu nome completo.');
      return;
    }

    try {
      if (isSignUp) {
        await onRegister({ name: name.trim(), email: cleanEmail, password });
      } else {
        await onLogin({ email: cleanEmail, password });
      }
    } catch {
      // Erro tratado pelo hook useAuth (exibido via prop `error`)
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setEmail("");
    setPassword("");
    setName("");
    setShowPassword(false);
    setLocalValidation(null);
    onClearError();
  };

  const activeError = localValidation || error;

  return (
    <div className="h-[var(--app-height,100dvh)] w-full bg-background text-foreground flex items-center justify-center p-4 relative overflow-y-auto overflow-x-hidden select-none font-sans pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <FloatingParticles />

      <div className="relative z-10 w-full max-w-md my-auto">
        <div className="bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
              <User className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {isSignUp ? 'Criar Conta' : 'Bem-vindo de volta'}
            </h1>
            <p className="text-muted-foreground">
              {isSignUp ? 'Cadastre-se para começar' : 'Entre para continuar'}
            </p>
          </div>

          {activeError && (
            <div className="mb-5 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-xs text-red-400 animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
              <span className="flex-1">{activeError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {isSignUp && (
              <AnimatedFormField
                type="text"
                name="name"
                placeholder="Nome Completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                icon={<User size={18} />}
                disabled={isLoading}
                autoComplete="name"
              />
            )}

            <AnimatedFormField
              type="email"
              name="email"
              placeholder="Endereço de E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={18} />}
              disabled={isLoading}
              autoComplete="email"
            />

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
              disabled={isLoading}
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />

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
                <span className="text-sm text-muted-foreground">Lembrar de mim</span>
              </label>

              {!isSignUp && (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline cursor-pointer"
                >
                  Esqueceu a senha?
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full relative group bg-primary text-primary-foreground py-3 px-4 rounded-lg font-medium transition-all duration-300 ease-in-out hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden cursor-pointer"
            >
              <span className={`transition-opacity duration-200 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
                {isSignUp ? 'Criar Conta' : 'Entrar'}
              </span>

              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
            </button>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-card text-muted-foreground">Ou continue com</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <SocialButton icon={<GithubIcon size={20} />} name="GitHub" />
              <SocialButton icon={<TwitterXIcon size={20} />} name="X (Twitter)" />
              <SocialButton icon={<LinkedinIcon size={20} />} name="LinkedIn" />
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              {isSignUp ? 'Já tem uma conta?' : 'Não tem uma conta?'}{' '}
              <button
                type="button"
                onClick={toggleMode}
                className="text-primary hover:underline font-medium cursor-pointer"
              >
                {isSignUp ? 'Entrar' : 'Cadastre-se'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
