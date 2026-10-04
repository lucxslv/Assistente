import { User } from '../types/auth';

/**
 * Utilitário de segurança e checagem de privilégio administrativo.
 * Elimina e-mails pessoais hardcoded no cliente e delega a autorização
 * para as claims/atributos validados pelo backend.
 */
export function checkIsAdmin(userOrEmail?: User | string | null): boolean {
  if (!userOrEmail) return false;

  // Se o objeto User foi fornecido, verifica a claim retornada pelo backend
  if (typeof userOrEmail === 'object') {
    if (userOrEmail.is_admin === true || userOrEmail.role === 'admin') {
      return true;
    }
  }

  const email = (typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email || '').toLowerCase().trim();
  if (!email) return false;

  // Suporte opcional à variável de ambiente para desenvolvimento sem hardcode
  const adminEnv = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim();
  if (adminEnv) {
    const list = adminEnv.split(',').map((e: string) => e.trim());
    if (list.includes(email)) return true;
  }

  return false;
}
