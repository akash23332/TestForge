import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface AsmrBackgroundProps {
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  isGlass: boolean;
  baseAlpha: number;
  glow: number;
}

export const AsmrBackground: React.FC<AsmrBackgroundProps> = ({ className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  const [cursorVisible, setCursorVisible] = useState(false);
  const [isHoveringInteractive, setIsHoveringInteractive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const parent = container.parentElement;
    if (!parent) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Check media queries
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isFinePointer = window.matchMedia('(pointer: fine)').matches;

    // Keep standard system cursor
    const updateParentCursor = () => {
      parent.style.cursor = '';
    };
    updateParentCursor();

    let width = parent.clientWidth || 800;
    let height = parent.clientHeight || 600;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    let particles: Particle[] = [];
    let animationFrameId = 0;
    let isPaused = false;
    let isOffscreen = false;

    // Pointer state relative to parent
    const pointer = {
      x: -9999,
      y: -9999,
      active: false
    };

    // Initialize particles based on parent dimensions: min(900, floor(width * height / 2000))
    const initParticles = () => {
      const count = Math.min(900, Math.max(80, Math.floor((width * height) / 2000)));
      particles = [];
      for (let i = 0; i < count; i++) {
        const isGlass = Math.random() < 0.3; // 30% glass, 70% charcoal
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          size: 0.6 + Math.random() * 1.5, // 0.6 - 2.1px
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.02,
          isGlass,
          baseAlpha: 0.15 + Math.random() * 0.4, // 0.15 - 0.55
          glow: 0
        });
      }
    };

    // Resize canvas based on parent
    const handleResize = () => {
      if (!parent || !canvas || !ctx) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Base background fill #191A1D on setup
      ctx.fillStyle = '#191A1D';
      ctx.fillRect(0, 0, width, height);

      initParticles();
      updateParentCursor();
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
      if (prefersReducedMotion) {
        drawStaticFrame();
      }
    });
    resizeObserver.observe(parent);

    // Draw single diamond shard
    const drawDiamond = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      size: number,
      rotation: number
    ) => {
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.beginPath();
      // 4-point diamond
      context.moveTo(0, -size);
      context.lineTo(size * 0.6, 0);
      context.lineTo(0, size);
      context.lineTo(-size * 0.6, 0);
      context.closePath();
      context.fill();
      context.restore();
    };

    // Static frame for prefers-reduced-motion
    const drawStaticFrame = () => {
      if (!ctx) return;
      ctx.fillStyle = '#191A1D';
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const alpha = p.baseAlpha;
        ctx.fillStyle = p.isGlass
          ? `rgba(240, 245, 255, ${alpha})`
          : `rgba(120, 122, 128, ${alpha})`;
        ctx.shadowBlur = 0;
        drawDiamond(ctx, p.x, p.y, p.size, p.rotation);
      }
    };

    // Animation loop with motion-blur trail
    const render = () => {
      if (!ctx || isPaused || isOffscreen) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Motion-blur trail: fill rgba(25, 26, 29, 0.18) every frame instead of clearing
      ctx.fillStyle = 'rgba(25, 26, 29, 0.18)';
      ctx.fillRect(0, 0, width, height);

      const px = pointer.x;
      const py = pointer.y;
      const hasPointer = pointer.active && px >= 0 && py >= 0;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Magnetic pull + swirl interaction within 280px radius
        if (hasPointer) {
          const dx = px - p.x;
          const dy = py - p.y;
          const dist = Math.hypot(dx, dy);

          if (dist < 280 && dist > 1) {
            const proximity = 1 - dist / 280; // 0 to 1
            const nx = dx / dist;
            const ny = dy / dist;

            // Magnetic pull: 0.12 scaled by proximity
            p.vx += nx * 0.12 * proximity * 3;
            p.vy += ny * 0.12 * proximity * 3;

            // Perpendicular swirl: (0.07 x 10) = 0.7 scaled by proximity
            p.vx += -ny * 0.7 * proximity;
            p.vy += nx * 0.7 * proximity;

            // Increase glow near pointer
            p.glow = Math.min(1, p.glow + proximity * 0.35);
          } else {
            // Glow decays x0.92 when out of range
            p.glow *= 0.92;
          }
        } else {
          p.glow *= 0.92;
        }

        // Random jitter (Brownian noise)
        p.vx += (Math.random() - 0.5) * 0.12;
        p.vy += (Math.random() - 0.5) * 0.12;

        // Damping 0.95
        p.vx *= 0.95;
        p.vy *= 0.95;

        // Position update
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;

        // Wrap around at ±20px margin
        if (p.x < -20) p.x = width + 20;
        else if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        else if (p.y > height + 20) p.y = -20;

        // Color and glow calculations (Clean particles without blurry cursor glow)
        ctx.shadowBlur = 0;
        if (p.glow > 0.05) {
          const limeAlpha = Math.min(0.85, p.baseAlpha + p.glow * 0.25);
          ctx.fillStyle = `rgba(237, 255, 114, ${limeAlpha})`;
        } else {
          const alpha = p.baseAlpha;
          ctx.fillStyle = p.isGlass
            ? `rgba(240, 245, 255, ${alpha})`
            : `rgba(120, 122, 128, ${alpha})`;
        }

        drawDiamond(ctx, p.x, p.y, p.size, p.rotation);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    // Pointer events relative to parent
    const handlePointerMove = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      pointer.x = x;
      pointer.y = y;
      pointer.active = true;

      // Update custom cursor ring position using viewport coordinates for fixed container
      if (cursorRef.current && isFinePointer && window.innerWidth >= 860 && !prefersReducedMotion) {
        cursorRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
        setCursorVisible(true);
      }

      // Check if target is a button, link or interactive control
      const target = e.target as HTMLElement | null;
      if (target) {
        const isInteractive = Boolean(target.closest('button, a, input, select, textarea, [role="button"], .clickable'));
        setIsHoveringInteractive(isInteractive);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const rect = parent.getBoundingClientRect();
        pointer.x = e.touches[0].clientX - rect.left;
        pointer.y = e.touches[0].clientY - rect.top;
        pointer.active = true;
      }
    };

    const handlePointerLeave = () => {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
      setCursorVisible(false);
      setIsHoveringInteractive(false);
    };

    parent.addEventListener('pointermove', handlePointerMove, { passive: true });
    parent.addEventListener('touchmove', handleTouchMove, { passive: true });
    parent.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    // Performance: Pause when hero is offscreen
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isOffscreen = !entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    intersectionObserver.observe(parent);

    // Performance: Pause when tab is hidden
    const handleVisibilityChange = () => {
      isPaused = document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial setup and render
    handleResize();

    if (prefersReducedMotion) {
      drawStaticFrame();
    } else {
      animationFrameId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      parent.removeEventListener('pointermove', handlePointerMove);
      parent.removeEventListener('touchmove', handleTouchMove);
      parent.removeEventListener('pointerleave', handlePointerLeave);
      parent.style.cursor = '';
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
      style={{ zIndex: -2 }}
    >
      {/* Interactive ASMR Canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 block h-full w-full pointer-events-none"
        style={{ zIndex: -2 }}
      />
    </div>
  );
};

export default AsmrBackground;
