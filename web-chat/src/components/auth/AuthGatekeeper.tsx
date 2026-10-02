import React, { useState } from 'react';
import { Mail, Lock, User as UserIcon, ArrowRight, AlertCircle, Eye, EyeOff, ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoginCredentials, RegisterCredentials } from '../../types/auth';

interface AuthGatekeeperProps {
  onLogin: (creds: LoginCredentials) => Promise<unknown>;
  onRegister: (creds: RegisterCredentials) => Promise<unknown>;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
}

export const AuthGatekeeper: React.FC<AuthGatekeeperProps> = ({
  onLogin,
  onRegister,
  isLoading,
  error,
  onClearError,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localValidation, setLocalValidation] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onClearError();
    setLocalValidation(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setLocalValidation('Por favor, informe um endereço de e-mail válido.');
      return;
    }

    if (password.length < 6) {
      setLocalValidation('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (tab === 'register') {
      if (!name.trim()) {
        setLocalValidation('Por favor, informe seu nome completo.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalValidation('As senhas não coincidem. Digite a mesma senha nos dois campos.');
        return;
      }
    }

    try {
      if (tab === 'login') {
        await onLogin({ email: cleanEmail, password });
      } else {
        await onRegister({ name: name.trim(), email: cleanEmail, password });
      }
    } catch {
      // Error handled by parent hook
    }
  };

  const activeError = localValidation || error;

  return (
    <div className="h-screen w-screen bg-[#0A0B0E] text-[#F3F4F6] flex items-center justify-center p-4 select-none relative overflow-hidden font-sans">
      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/[0.04] rounded-full blur-3xl pointer-events-none" />

      {/* Main Gatekeeper Card */}
      <div className="w-full max-w-md bg-[#111318] border border-white/[0.08] rounded-2xl shadow-2xl p-6 sm:p-8 relative z-10 flex flex-col backdrop-blur-xl">
        {/* Branding & Status Badge */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#161922] border border-white/[0.1] flex items-center justify-center p-3 shadow-[0_0_24px_rgba(99,102,241,0.2)] mb-4">
            <img
              src="/charlie-logo.svg"
              alt="Charlie"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono font-medium text-emerald-400 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>SISTEMA PRONTO • CONFIGURAÇÃO ATIVA</span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            {tab === 'login' ? 'Acesso ao Charlie Web' : 'Criar Conta no Charlie'}
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs">
            {tab === 'login'
              ? 'Autenticação obrigatória. Conecte-se para acessar suas conversas e ferramentas.'
              : 'Cadastre-se na nuvem para ter seu assistente pessoal com memória duradoura.'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-[#0C0E12] p-1 mb-5 border border-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              onClearError();
              setLocalValidation(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              tab === 'login'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              onClearError();
              setLocalValidation(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              tab === 'register'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Criar Conta
          </button>
        </div>

        {/* Error Notification */}
        {activeError && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-xs text-red-400 animate-fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
            <span className="flex-1">{activeError}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {tab === 'register' && (
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">Nome Completo</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  disabled={isLoading}
                  className="w-full bg-[#0C0D12] border border-white/[0.08] focus:border-indigo-500/60 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">E-mail</label>
            <div className="relative">
              <input
                type="email"
                required
                autoFocus={tab === 'login'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                disabled={isLoading}
                className="w-full bg-[#0C0D12] border border-white/[0.08] focus:border-indigo-500/60 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                disabled={isLoading}
                className="w-full bg-[#0C0D12] border border-white/[0.08] focus:border-indigo-500/60 rounded-lg px-3 py-2 pr-9 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {tab === 'register' && (
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">Confirmar Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita sua senha"
                  disabled={isLoading}
                  className="w-full bg-[#0C0D12] border border-white/[0.08] focus:border-indigo-500/60 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 py-2.5 px-4 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition shadow-md disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <>
                <span>{tab === 'login' ? 'Entrar no Charlie' : 'Criar Conta e Acessar'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Security & Zero Config Guarantee Badge */}
        <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
          <span>Autenticado via Supabase Auth • Criptografia JWT</span>
        </div>
      </div>
    </div>
  );
};
