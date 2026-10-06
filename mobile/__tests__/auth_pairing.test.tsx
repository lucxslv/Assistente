import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AuthScreen from '../app/auth';
import { AuthProvider } from '../src/hooks/useAuth';
import { router } from 'expo-router';
import { authStorage } from '../src/services/authStorage';

describe('Fluxo 1: Conexão Remota e Pareamento Inicial (Ótica do Usuário)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await authStorage.clearPairedCredentials();
  });

  it('permite ao usuário digitar o PIN de 6 dígitos, autenticar e ser redirecionado', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/pair/verify-pin')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            token: 'charlie_dev_test_token_123',
            lan_url: 'http://192.168.1.50:8000',
            device_id: '12345678-1234-4234-8234-123456789abc',
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

    // O usuário visualiza o input de PIN e digita os 6 dígitos do computador
    const pinInput = await screen.findByTestId('pin-input');
    await fireEvent.changeText(pinInput, '654321');

    // O usuário pressiona o botão de conexão com o PC
    const submitBtn = await screen.findByTestId('pin-submit-button');
    await fireEvent.press(submitBtn);

    // Valida que o endpoint de validação de PIN foi invocado com o payload correto
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/pair/verify-pin'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"pin":"654321"'),
        })
      );
    });

    // O usuário é autenticado e redirecionado para a tela principal
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
  });

  it('exibe mensagem de erro clara quando o PIN é rejeitado pelo computador', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/pair/verify-pin')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            detail: 'PIN incorreto ou sessão expirada.',
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

    const pinInput = await screen.findByTestId('pin-input');
    await fireEvent.changeText(pinInput, '999999');

    const submitBtn = await screen.findByTestId('pin-submit-button');
    await fireEvent.press(submitBtn);

    const errorMsg = await screen.findByText('PIN incorreto ou sessão expirada.');
    expect(errorMsg).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
