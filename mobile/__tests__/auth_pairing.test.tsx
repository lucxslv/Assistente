import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AuthScreen from '../app/auth';
import { AuthProvider } from '../src/hooks/useAuth';
import { router } from 'expo-router';
import { authStorage } from '../src/services/authStorage';

describe('Autenticação de Usuário e Pareamento com Desktop', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await authStorage.clearPairedCredentials();
  });

  it('permite ao usuário fazer login com e-mail e senha e ser redirecionado para a tela principal', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/auth/login')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            token: 'test_token_jwt',
            user: {
              id: 'user-lucas-123',
              name: 'Lucas Silva',
              email: 'lucas@exemplo.com',
            },
          }),
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    });

    const screen = await render(
      <AuthProvider>
        <AuthScreen />
      </AuthProvider>
    );

    const emailInput = await screen.findByTestId('email-input');
    const passwordInput = await screen.findByTestId('password-input');

    await fireEvent.changeText(emailInput, 'lucas@exemplo.com');
    await fireEvent.changeText(passwordInput, 'senha123456');

    const submitBtn = await screen.findByTestId('auth-submit-button');
    await fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
  });

  it('exibe mensagem de erro clara quando as credenciais são rejeitadas', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/auth/login')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            detail: 'Credenciais inválidas. Verifique seu e-mail e senha.',
          }),
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    });

    const screen = await render(
      <AuthProvider>
        <AuthScreen />
      </AuthProvider>
    );

    const emailInput = await screen.findByTestId('email-input');
    const passwordInput = await screen.findByTestId('password-input');

    await fireEvent.changeText(emailInput, 'errado@exemplo.com');
    await fireEvent.changeText(passwordInput, 'senhaerrada');

    const submitBtn = await screen.findByTestId('auth-submit-button');
    await fireEvent.press(submitBtn);

    const errorMsg = await screen.findByText('Credenciais inválidas. Verifique seu e-mail e senha.');
    expect(errorMsg).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('permite abrir o modal de pareamento direto com o computador', async () => {
    const screen = await render(
      <AuthProvider>
        <AuthScreen />
      </AuthProvider>
    );

    const pairBtn = await screen.findByTestId('qr-scanner-button');
    expect(pairBtn).toBeTruthy();
    await fireEvent.press(pairBtn);
  });
});
