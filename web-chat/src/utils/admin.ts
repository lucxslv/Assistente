/**
 * Utilitário de segurança e checagem de privilégio administrativo.
 */

// Permite múltiplos e-mails separados por vírgula em VITE_ADMIN_EMAIL
const ADMIN_EMAIL_ENV = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim();

const KNOWN_ADMINS = [
  'lucassilvacosta060@gmail.com',
  'lucassilvacosta062@gmail.com',
];

export function checkIsAdmin(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();

  if (ADMIN_EMAIL_ENV) {
    const list = ADMIN_EMAIL_ENV.split(',').map((e: string) => e.trim());
    if (list.includes(clean)) return true;
  }

  return KNOWN_ADMINS.includes(clean);
}
