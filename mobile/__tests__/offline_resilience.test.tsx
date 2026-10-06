import React from 'react';
import { Text, View } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { session } from '../src/lib/session';

// Mock apiClient / api
jest.mock('../src/services/api', () => ({
  api: {
    get: jest.fn().mockRejectedValue(new TypeError('Network request failed (offline)')),
    post: jest.fn(),
  },
}));

function ConsumerComponent() {
  const { user, token, loading } = useAuth();
  if (loading) {
    return <Text testID="loading">Carregando...</Text>;
  }
  return (
    <View>
      <Text testID="user-name">{user ? user.name : 'Deslogado'}</Text>
      <Text testID="token-val">{token ? 'Autenticado' : 'Sem token'}</Text>
    </View>
  );
}

describe('Fluxo 2: Tolerância e Resiliência Offline (Ótica do Usuário)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Pré-carrega sessão salva no SecureStore simulado
    await session.save({
      token: 'jwt_offline_valid_token_abc',
      user: {
        id: '12345678-1234-4234-8234-123456789abc',
        name: 'Lucas Local',
        email: 'lucas@charlie.local',
      },
    });
  });

  it('mantém a sessão e a identidade do usuário preservadas ao abrir offline', async () => {
    const screen = await render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>
    );

    // Aguarda término da inicialização
    await waitFor(() => {
      expect(screen.queryByTestId('loading')).toBeNull();
    });

    // O usuário não deve ser deslogado mesmo com falha total de rede
    const userName = screen.getByTestId('user-name');
    const tokenVal = screen.getByTestId('token-val');

    expect(userName.props.children).toBe('Lucas Local');
    expect(tokenVal.props.children).toBe('Autenticado');

    // Confirma que a sessão salva não foi expurgada do SecureStore
    const saved = await session.getUser();
    expect(saved).not.toBeNull();
    expect(saved?.name).toBe('Lucas Local');
  });
});
