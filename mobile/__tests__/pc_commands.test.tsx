import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DesktopRemotePad } from '../src/components/DesktopRemotePad';
import { desktopControlService } from '../src/services/desktopControl';

jest.mock('../src/services/desktopControl', () => ({
  desktopControlService: {
    getDeviceStatus: jest.fn().mockResolvedValue({
      is_online: true,
      device_name: 'PC Lucas Principal',
      telemetry: {
        cpu_percent: 18,
        memory_used_mb: 8192,
        memory_total_mb: 32768,
        memory_percent: 25,
      },
    }),
    lockPC: jest.fn(),
    minimizeAll: jest.fn(),
    setVolume: jest.fn(),
    toggleMute: jest.fn(),
    sendMediaKey: jest.fn(),
    captureScreenshot: jest.fn(),
    openShortcut: jest.fn(),
  },
}));

describe('Fluxo 3: Execução de Comandos Remotos no PC (Ótica do Usuário)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aciona o comando de bloqueio do PC com confirmação e exibe feedback de sucesso', async () => {
    (desktopControlService.lockPC as jest.Mock).mockResolvedValueOnce(true);

    const onActionMock = jest.fn();
    const screen = await render(
      <DesktopRemotePad onActionExecuted={onActionMock} />
    );

    // O usuário clica no card de Bloquear PC
    const lockCard = screen.getByTestId('remote-lock-button');
    fireEvent.press(lockCard);

    // O modal de confirmação de segurança é exibido e o usuário confirma a ação
    const confirmBtn = await screen.findByTestId('remote-lock-confirm');
    fireEvent.press(confirmBtn);

    // Valida chamada do serviço
    await waitFor(() => {
      expect(desktopControlService.lockPC).toHaveBeenCalledTimes(1);
    });

    // O usuário recebe o feedback visual imediato de sucesso na interface
    const feedbackBanner = await screen.findByTestId('remote-feedback-banner');
    expect(feedbackBanner).toBeTruthy();

    const feedbackText = screen.getByTestId('remote-feedback-text');
    expect(feedbackText.props.children).toBe('PC Bloqueado com sucesso!');
    expect(onActionMock).toHaveBeenCalledWith('Bloquear PC');
  });

  it('exibe feedback de erro caso a máquina física recuse ou falhe na execução', async () => {
    (desktopControlService.minimizeAll as jest.Mock).mockRejectedValueOnce(
      new Error('Timeout de comunicação com o host')
    );

    const screen = await render(
      <DesktopRemotePad />
    );

    // O usuário clica em Minimizar Tudo
    const minimizeBtn = screen.getByTestId('remote-minimize-button');
    fireEvent.press(minimizeBtn);

    // O usuário recebe o feedback visual de falha
    const feedbackBanner = await screen.findByTestId('remote-feedback-banner');
    expect(feedbackBanner).toBeTruthy();

    const feedbackText = screen.getByTestId('remote-feedback-text');
    expect(feedbackText.props.children).toBe('Erro ao minimizar janelas.');
  });
});
