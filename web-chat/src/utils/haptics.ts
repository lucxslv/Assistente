/**
 * Haptic Feedback Utility (Vibration API)
 * Fornece micro-vibrações táteis defensivas para navegadores mobile.
 * Se a API não estiver disponível (e.g. iOS Safari ou desktop), falha silenciosamente.
 */

export const hapticFeedback = {
  /**
   * Pulso ultracurto (10ms) ao enviar mensagens ou tocar botões de ação direta.
   */
  light: () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignora silenciosamente se o dispositivo rejeitar
      }
    }
  },

  /**
   * Pulso duplo rápido ([8, 30, 8]ms) ao copiar blocos de código ou mensagens.
   */
  success: () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([8, 30, 8]);
      } catch {
        // Ignora silenciosamente
      }
    }
  },

  /**
   * Pulso tátil leve (15ms) para seleção de threads, nova conversa ou alternância de abas.
   */
  select: () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        // Ignora silenciosamente
      }
    }
  },

  /**
   * Pulso tátil de alerta/exclusão (25ms) para ações destrutivas (excluir chat, interromper).
   */
  warning: () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch {
        // Ignora silenciosamente
      }
    }
  },
};
