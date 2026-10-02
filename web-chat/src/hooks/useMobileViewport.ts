import { useState, useEffect } from 'react';

/**
 * Hook para sincronizar dinamicamente a altura visível do app no mobile (Visual Viewport API).
 * Resolve problemas clássicos de navegadores móveis onde o teclado virtual ou a barra de navegação
 * do sistema (botões Voltar/Home do Android) cobrem o campo de texto ou empurram a tela.
 */
export function useMobileViewport() {
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUpdate = () => {
      const vv = window.visualViewport;
      const currentHeight = vv ? vv.height : window.innerHeight;
      const screenHeight = window.screen.height || window.innerHeight;
      const windowHeight = window.innerHeight;

      setViewportHeight(currentHeight);

      // Detecta se o teclado virtual está aberto (diferença de altura perceptível > 120px)
      const diff = windowHeight - currentHeight;
      const keyboardActive = diff > 120;
      setIsKeyboardOpen(keyboardActive);

      // Atualiza variáveis CSS no root do documento para adaptação instantânea
      document.documentElement.style.setProperty('--app-height', `${currentHeight}px`);
      document.documentElement.style.setProperty(
        '--keyboard-offset',
        `${keyboardActive ? Math.max(0, diff) : 0}px`
      );
    };

    handleUpdate();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleUpdate);
      window.visualViewport.addEventListener('scroll', handleUpdate);
    } else {
      window.addEventListener('resize', handleUpdate);
      window.addEventListener('orientationchange', handleUpdate);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleUpdate);
        window.visualViewport.removeEventListener('scroll', handleUpdate);
      } else {
        window.removeEventListener('resize', handleUpdate);
        window.removeEventListener('orientationchange', handleUpdate);
      }
    };
  }, []);

  return { viewportHeight, isKeyboardOpen };
}
