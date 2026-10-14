import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  User as UserIcon,
  Globe,
  AtSign,
  FileText,
  Check,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { User, ProfileUpdatePayload } from '../../types/auth';

interface ProfileModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSaveProfile: (payload: ProfileUpdatePayload) => Promise<User>;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  user,
  onClose,
  onSaveProfile,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [website, setWebsite] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      const fullNameParts = (user.name || '').trim().split(' ');
      setFirstName(user.first_name ?? fullNameParts[0] ?? '');
      setLastName(user.last_name ?? fullNameParts.slice(1).join(' ') ?? '');
      setUsername(user.username ?? '');
      setWebsite(user.website ?? '');
      setBio(user.bio ?? '');
      setAvatarUrl(user.avatar_url || user.avatarUrl || '');
      setBannerUrl(user.banner_url || '');
      setError(null);
      setSavedSuccess(false);
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const handleImageSelect = (
    file: File | undefined,
    maxWidth: number,
    maxHeight: number,
    onResult: (dataUrl: string) => void
  ) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem válido (PNG, JPG ou WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem selecionada excede 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        const scale = Math.min(maxWidth / w, maxHeight / h, 1);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.84);
          onResult(compressed);
          setError(null);
        } else {
          onResult(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setError(null);
    setSavedSuccess(false);

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanUsername = username.trim().replace(/^@+/, '');
    const cleanWebsite = website.trim();
    const cleanBio = bio.trim();

    if (!cleanFirst) {
      setError('Informe pelo menos o seu primeiro nome.');
      return;
    }

    if (cleanUsername && !/^[a-zA-Z0-9_.-]{2,32}$/.test(cleanUsername)) {
      setError('O username deve ter entre 2 e 32 caracteres (letras, números, _, . ou -).');
      return;
    }

    if (cleanWebsite && !/^https?:\/\/.+/i.test(cleanWebsite)) {
      setError('O website deve iniciar com http:// ou https://');
      return;
    }

    if (cleanBio.length > 180) {
      setError('A biografia deve ter no máximo 180 caracteres.');
      return;
    }

    const combinedName = `${cleanFirst} ${cleanLast}`.trim();

    setIsSaving(true);
    try {
      await onSaveProfile({
        name: combinedName,
        first_name: cleanFirst,
        last_name: cleanLast,
        username: cleanUsername,
        website: cleanWebsite,
        bio: cleanBio,
        avatar_url: avatarUrl,
        banner_url: bannerUrl,
      });
      setSavedSuccess(true);
      setTimeout(() => {
        onClose();
      }, 650);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Não foi possível salvar as alterações do perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  const initials = (firstName || user.name || 'U').slice(0, 2).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#0E0F12] border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-[#12141A]">
          <div>
            <h2 className="text-sm font-semibold text-[#F3F4F6]">Perfil do Usuário</h2>
            <p className="text-[11px] text-[#9CA3AF]">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Fechar modal de perfil"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          {/* Banner Header & Avatar */}
          <div className="relative">
            <div
              className="h-28 sm:h-32 w-full bg-gradient-to-r from-blue-600/30 via-indigo-600/25 to-emerald-500/20 border-b border-white/[0.06] relative overflow-hidden flex items-center justify-end p-3"
              style={
                bannerUrl
                  ? {
                      backgroundImage: `url(${bannerUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
            >
              <div className="flex items-center gap-1.5 z-10">
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-lg bg-black/65 hover:bg-black/80 text-[#F3F4F6] border border-white/[0.12] text-[11px] flex items-center gap-1.5 backdrop-blur-sm transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-primary" />
                  <span>Alterar Capa</span>
                </button>
                {bannerUrl && (
                  <button
                    type="button"
                    onClick={() => setBannerUrl('')}
                    className="p-1.5 rounded-lg bg-black/65 hover:bg-red-500/30 text-red-300 border border-white/[0.12] transition-colors cursor-pointer"
                    title="Remover capa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleImageSelect(e.target.files?.[0], 960, 320, setBannerUrl);
                  e.target.value = '';
                }}
              />
            </div>

            {/* Avatar Circle */}
            <div className="px-5 -mt-10 flex items-end justify-between">
              <div className="relative group">
                <div className="w-20 h-20 rounded-2xl bg-[#181B22] border-2 border-[#0E0F12] ring-1 ring-white/[0.12] overflow-hidden flex items-center justify-center text-lg font-bold text-primary shadow-xl">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 p-1.5 rounded-xl bg-primary text-white shadow-lg hover:bg-primary/90 transition-transform active:scale-95 cursor-pointer"
                  title="Alterar foto de perfil"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleImageSelect(e.target.files?.[0], 256, 256, setAvatarUrl);
                    e.target.value = '';
                  }}
                />
              </div>

              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl('')}
                  className="text-[11px] text-[#9CA3AF] hover:text-red-400 transition-colors cursor-pointer pb-1"
                >
                  Remover foto
                </button>
              )}
            </div>
          </div>

          {/* Fields */}
          <div className="p-5 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {savedSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                <span>Perfil atualizado com sucesso!</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                  Nome
                </label>
                <div className="relative">
                  <UserIcon className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Seu nome"
                    maxLength={60}
                    className="w-full bg-[#14171F] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2 text-xs text-[#F3F4F6] focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                  Sobrenome
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Seu sobrenome"
                  maxLength={60}
                  className="w-full bg-[#14171F] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-[#F3F4F6] focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                  Username
                </label>
                <div className="relative">
                  <AtSign className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="seu_usuario"
                    maxLength={32}
                    className="w-full bg-[#14171F] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2 text-xs text-[#F3F4F6] font-mono focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                  Website
                </label>
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://seusite.com"
                    maxLength={200}
                    className="w-full bg-[#14171F] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2 text-xs text-[#F3F4F6] focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#9CA3AF]">
                  <FileText className="w-3.5 h-3.5 text-[#6B7280]" />
                  <span>Biografia / Cargo</span>
                </label>
                <span
                  className={`text-[10px] font-mono ${
                    bio.length > 165 ? 'text-amber-400' : 'text-[#6B7280]'
                  }`}
                >
                  {bio.length}/180
                </span>
              </div>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 180))}
                placeholder="Conte um pouco sobre você ou como prefere que o Charlie responda..."
                maxLength={180}
                className="w-full bg-[#14171F] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-[#F3F4F6] resize-none focus:outline-none focus:border-primary/50 leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-[#D1D5DB] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-xs font-semibold text-white shadow-glow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Salvando...' : 'Salvar Perfil'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
