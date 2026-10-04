import { useRef, useState, useEffect, useCallback } from 'react';

export function useAutoScroll<T extends HTMLElement>() {
  const containerRef = useRef<T | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const isScrolledUpRef = useRef<boolean>(false);
  const scrollRafRef = useRef<number | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      isScrolledUpRef.current = false;
      setIsScrolledUp(false);
      setUnreadCount(0);
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // Histerese estável: considera rolado para cima em > 80px, volta para baixo em <= 30px
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > 80) {
      isScrolledUpRef.current = true;
      setIsScrolledUp(true);
    } else if (distanceFromBottom <= 30) {
      isScrolledUpRef.current = false;
      setIsScrolledUp(false);
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [handleScroll]);

  // Method to invoke on new token or new message
  const onNewContent = useCallback(
    (isStreamingToken = false) => {
      if (isScrolledUpRef.current) {
        if (!isStreamingToken) {
          setUnreadCount((c) => c + 1);
        }
      } else {
        if (isStreamingToken) {
          // Throttled follow via rAF para prevenir layout thrashing em alta taxa de tokens
          if (!scrollRafRef.current) {
            scrollRafRef.current = requestAnimationFrame(() => {
              scrollRafRef.current = null;
              if (!isScrolledUpRef.current && containerRef.current) {
                containerRef.current.scrollTop = containerRef.current.scrollHeight;
              }
            });
          }
        } else {
          scrollToBottom(true);
        }
      }
    },
    [scrollToBottom]
  );

  return {
    containerRef,
    isScrolledUp,
    unreadCount,
    scrollToBottom,
    onNewContent,
  };
}
