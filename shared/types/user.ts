/**
 * Contrato Canônico de Autenticação e Usuário do Charlie.
 */

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
