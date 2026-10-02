import { useRef, useState, useEffect, useCallback } from 'react';

export function useAutoScroll<T extends HTMLElement>() {
  const containerRef = useRef<T | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const scrollToBottom = useCallback((smooth = true) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      setIsScrolledUp(false);
      setUnreadCount(0);
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // Tolerance of 60px from the bottom
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distanceFromBottom > 60;
    setIsScrolledUp(isUp);

    if (!isUp) {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Method to invoke on new token or new message
  const onNewContent = useCallback(
    (isStreamingToken = false) => {
      if (isScrolledUp) {
        if (!isStreamingToken) {
          setUnreadCount((c) => c + 1);
        }
      } else {
        // Only smooth scroll on message start, fast auto follow during streaming tokens
        scrollToBottom(!isStreamingToken);
      }
    },
    [isScrolledUp, scrollToBottom]
  );

  return {
    containerRef,
    isScrolledUp,
    unreadCount,
    scrollToBottom,
    onNewContent,
  };
}
