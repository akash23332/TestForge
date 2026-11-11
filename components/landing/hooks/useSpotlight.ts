import React, { useRef, useState, useCallback, useEffect } from 'react';

interface SpotlightOptions {
  maxTilt?: number;
  perspective?: number;
  lift?: number;
}

export const useSpotlight = (options: SpotlightOptions = {}) => {
  const { maxTilt = 8, perspective = 900, lift = 6 } = options;
  const cardRef = useRef<HTMLDivElement | null>(null);

  const [tilt, setTilt] = useState({ rx: 0, ry: 0, tz: 0 });
  const [spotlightPos, setSpotlightPos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const touchCheck = window.matchMedia('(pointer: coarse)').matches;
      setIsTouch(touchCheck);
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isTouch) return;
      const el = cardRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const px = Math.min(Math.max((x / rect.width) * 100, 0), 100);
      const py = Math.min(Math.max((y / rect.height) * 100, 0), 100);

      // Centered coordinates (-1 to 1)
      const cx = (x - rect.width / 2) / (rect.width / 2);
      const cy = (y - rect.height / 2) / (rect.height / 2);

      const rx = -cy * maxTilt;
      const ry = cx * maxTilt;

      setTilt({ rx, ry, tz: lift });
      setSpotlightPos({ x: px, y: py });
      setIsHovered(true);

      el.style.setProperty('--mx', `${px.toFixed(1)}%`);
      el.style.setProperty('--my', `${py.toFixed(1)}%`);
    },
    [isTouch, maxTilt, lift]
  );

  const handlePointerLeave = useCallback(() => {
    setTilt({ rx: 0, ry: 0, tz: 0 });
    setIsHovered(false);
    const el = cardRef.current;
    if (el) {
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
    }
  }, []);

  const cardStyle: React.CSSProperties = isTouch
    ? {}
    : {
        perspective: `${perspective}px`,
        transformStyle: 'preserve-3d',
        transform: `perspective(${perspective}px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(${tilt.tz}px)`,
        transition: isHovered
          ? 'transform 0.08s ease-out'
          : 'transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1)',
      };

  return {
    cardRef,
    cardStyle,
    isHovered,
    spotlightPos,
    handlePointerMove,
    handlePointerLeave,
  };
};

export default useSpotlight;
