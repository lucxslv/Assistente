import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { MessageItem } from '../src/components/MessageItem';
import { ChatMessage } from '../src/types/api';

describe('Fluxo 4: Cópia Real para Clipboard (Ótica do Usuário)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const assistantMessage: ChatMessage = {
    id: 'msg-123',
    role: 'assistant',
    content: 'Aqui está o comando solicitado:\n```bash\ngit pull origin main\n```\nExecute no seu terminal.',
    status: 'done',
    createdAt: new Date().toISOString(),
  };

  it('grava o conteúdo integral da mensagem na área de transferência ao clicar em Copiar', async () => {
    const screen = await render(
      <MessageItem message={assistantMessage} />
    );

    // O usuário clica no botão "Copiar"
    const copyBtn = await screen.findByTestId('copy-message-button');
    await fireEvent.press(copyBtn);

    // Valida que a API nativa do Clipboard gravou a mensagem real
    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(assistantMessage.content);
    });

    // O usuário recebe feedback visual imediato de "Copiado!"
    const copiedText = await screen.findByText('Copiado!');
    expect(copiedText).toBeTruthy();
  });

  it('extrai e grava apenas o bloco de código ao clicar no botão Código', async () => {
    const screen = await render(
      <MessageItem message={assistantMessage} />
    );

    // O usuário visualiza e clica no atalho rápido "Código"
    const codeBtn = await screen.findByTestId('copy-code-button');
    await fireEvent.press(codeBtn);

    // Valida que o trecho puro de código foi copiado sem os textos periféricos
    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('git pull origin main');
    });
  });
});
