/**
 * Design Tokens Oficiais do Charlie: Clean Technical Palette.
 * Compartilhado entre Desktop, Web Chat e Mobile.
 */

export const CleanTechnicalColors = {
  // Fundos e Superfícies
  background: '#0A0B0E',
  surface: '#0E0F12',
  surfaceCard: '#13151A',
  surfaceHover: '#181B22',
  surfaceElevated: '#1E222B',

  // Bordas e Divisores
  border: 'rgba(255, 255, 255, 0.06)',
  borderHover: 'rgba(255, 255, 255, 0.12)',
  borderFocus: 'rgba(139, 124, 255, 0.40)',

  // Destaque Primário (Charlie Purple / Indigo)
  primary: '#8B7CFF',
  primaryHover: '#9D90FF',
  primarySoft: 'rgba(139, 124, 255, 0.12)',
  primaryBorder: 'rgba(139, 124, 255, 0.25)',

  // Acentos Funcionais
  accentCyan: '#38BDF8',
  accentEmerald: '#10B981',
  accentAmber: '#F59E0B',
  accentRose: '#F43F5E',

  // Tipografia e Contrastes
  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  textDim: '#4B5563',
} as const;

export type ColorToken = keyof typeof CleanTechnicalColors;
