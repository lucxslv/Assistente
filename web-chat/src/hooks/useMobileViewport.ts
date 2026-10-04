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

      // Detecta se o teclado virtual está ativo (diferença ou proporção da tela)
      const diff = windowHeight - currentHeight;
      const keyboardActive = diff > 120 || (screenHeight > 0 && currentHeight < screenHeight * 0.72);
      setIsKeyboardOpen(keyboardActive);

      // Garante que o window permaneça travado em (0, 0)
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;

      // Atualiza variáveis CSS no root do documento para adaptação instantânea
      document.documentElement.style.setProperty('--app-height', `${currentHeight}px`);
      document.documentElement.style.setProperty(
        '--keyboard-offset',
        `${keyboardActive ? Math.max(0, diff) : 0}px`
      );
    };

    handleUpdate();

    const lockWindowScroll = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
    };

    window.addEventListener('scroll', lockWindowScroll, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleUpdate);
      window.visualViewport.addEventListener('scroll', handleUpdate);
    } else {
      window.addEventListener('resize', handleUpdate);
      window.addEventListener('orientationchange', handleUpdate);
    }

    // Previne rolagem acidental no body em mobile
    const preventBounce = (e: TouchEvent) => {
      if (e.touches.length > 1) return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.overflow-y-auto, .overflow-x-auto, textarea, input')) {
        // Previne rubber-banding em áreas fixas
        if (e.cancelable) e.preventDefault();
      }
    };

    window.addEventListener('touchmove', preventBounce, { passive: false });

    return () => {
      window.removeEventListener('scroll', lockWindowScroll);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleUpdate);
        window.visualViewport.removeEventListener('scroll', handleUpdate);
      } else {
        window.removeEventListener('resize', handleUpdate);
        window.removeEventListener('orientationchange', handleUpdate);
      }
      window.removeEventListener('touchmove', preventBounce);
    };
  }, []);

  return { viewportHeight, isKeyboardOpen };
}
