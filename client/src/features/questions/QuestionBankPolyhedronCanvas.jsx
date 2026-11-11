import React, { useEffect, useRef } from 'react';

export const QuestionBankPolyhedronCanvas = ({ heroRef, className = '' }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Golden ratio for icosahedron (12 vertices, 30 edges, 20 triangular faces)
    const T = (1 + Math.sqrt(5)) / 2;
    const V = [
      [-1, T, 0],
      [1, T, 0],
      [-1, -T, 0],
      [1, -T, 0],
      [0, -1, T],
      [0, 1, T],
      [0, -1, -T],
      [0, 1, -T],
      [T, 0, -1],
      [T, 0, 1],
      [-T, 0, -1],
      [-T, 0, 1]
    ];

    // Compute edges between all pairs where distance = 2
    const E = [];
    for (let a = 0; a < 12; a++) {
      for (let b = a + 1; b < 12; b++) {
        const d = Math.hypot(V[a][0] - V[b][0], V[a][1] - V[b][1], V[a][2] - V[b][2]);
        if (Math.abs(d - 2) < 0.01) E.push([a, b]);
      }
    }

    // 20 Triangular faces for subtle 3D facet shading
    const F = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];

    // Background floating 3D dust particles
    const DUST_COUNT = 24;
    const dust = Array.from({ length: DUST_COUNT }, () => ({
      x: (Math.random() - 0.5) * 5,
      y: (Math.random() - 0.5) * 5,
      z: (Math.random() - 0.5) * 5,
      size: Math.random() * 2 + 1,
      speed: (Math.random() * 0.004 + 0.002) * (Math.random() > 0.5 ? 1 : -1)
    }));

    let W = 0;
    let H = 0;
    let D = 1;
    let ry = 0;
    let rx = 0.35;
    let curPx = 0;
    let curPy = 0;
    let targetPx = 0;
    let targetPy = 0;
    let tm = 0;
    let animId = null;

    const sz = () => {
      D = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth || 360;
      H = cv.clientHeight || 320;
      cv.width = W * D;
      cv.height = H * D;
      ctx.setTransform(D, 0, 0, D, 0, 0);
    };

    const handlePointerMove = (e) => {
      const parent = heroRef?.current || cv.parentElement;
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      targetPx = (e.clientX - r.left) / r.width - 0.5;
      targetPy = (e.clientY - r.top) / r.height - 0.5;

      // Update hero radial spotlight CSS variables with glowing bloom
      parent.style.setProperty('--mx', `${e.clientX - r.left}px`);
      parent.style.setProperty('--my', `${e.clientY - r.top}px`);
    };

    const parent = heroRef?.current || cv.parentElement;
    if (parent) {
      parent.addEventListener('pointermove', handlePointerMove);
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Kinetic floating oscillation matching Test Suite float
      const floatOffset = Math.sin(tm * 1.5) * 6;
      const cx = W * 0.5;
      const cy = H * 0.48 + floatOffset;

      // Scaled down compact size (S = 0.155)
      const S = Math.min(W, H) * 0.155;

      // Smooth gyroscopic physical inertia for cursor tilt
      curPx += (targetPx - curPx) * 0.08;
      curPy += (targetPy - curPy) * 0.08;

      ry += 0.007;
      tm += 0.016;

      const A = ry + curPx * 1.1;
      const B = rx + curPy * 0.8;
      const cA = Math.cos(A);
      const sA = Math.sin(A);
      const cB = Math.cos(B);
      const sB = Math.sin(B);

      // 0. Compact floor shadow
      const shadowY = H - 24;
      const shadowW = Math.max(18, S * 0.95 * (1 - floatOffset / 50));
      const shadowH = Math.max(2, 6 * (1 - floatOffset / 50));
      const shadowGrad = ctx.createRadialGradient(cx, shadowY, 0, cx, shadowY, shadowW);
      shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
      shadowGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.24)');
      shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, shadowY, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fillStyle = shadowGrad;
      ctx.fill();
      ctx.restore();

      // 1. Draw floating ambient 3D dust particles in depth
      dust.forEach((pt) => {
        pt.y += pt.speed;
        if (pt.y > 2.5) pt.y = -2.5;
        if (pt.y < -2.5) pt.y = 2.5;

        const x = pt.x * cA + pt.z * sA;
        let z = -pt.x * sA + pt.z * cA;
        const y = pt.y * cB - z * sB;
        z = pt.y * sB + z * cB;

        const f = 4 / (4 + z * 0.35);
        const screenX = cx + x * S * f;
        const screenY = cy + y * S * f;
        const alpha = Math.max(0.1, Math.min(0.6, (z + 2) / 4));

        ctx.beginPath();
        ctx.arc(screenX, screenY, pt.size * f, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 255, 90, ${alpha * 0.5})`;
        ctx.fill();
      });

      // Project 12 vertices to 2.5D with perspective
      const P = V.map((v) => {
        const x = v[0] * cA + v[2] * sA;
        let z = -v[0] * sA + v[2] * cA;
        const y = v[1] * cB - z * sB;
        z = v[1] * sB + z * cB;
        const f = 4.2 / (4.2 + z * 0.35);
        return { x: cx + x * S * f, y: cy + y * S * f, z, f };
      });

      // 2. Dual Concentric Orbit Rings (Back Half)
      const drawOrbitRing = (radiusMult, tiltRad, back, opacity, dash = false) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tiltRad);
        ctx.beginPath();
        if (dash) ctx.setLineDash([4, 6]);
        const rr = S * radiusMult;
        const start = back ? Math.PI : 0;
        const end = (back ? 2 * Math.PI : Math.PI) + 0.01;
        for (let a = start; a <= end; a += 0.04) {
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr * 0.38;
          if (a === start) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(232, 255, 90, ${back ? opacity * 0.3 : opacity})`;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.restore();
      };

      // Primary ring (tilted -0.45) & Secondary outer ring (tilted 0.55)
      drawOrbitRing(1.32, -0.45, true, 0.45);
      drawOrbitRing(1.50, 0.55, true, 0.25, true);

      // 3. Facet shading for 3D solidity
      F.forEach(([i1, i2, i3]) => {
        const p1 = P[i1], p2 = P[i2], p3 = P[i3];
        // Calculate 2D normal z to cull backfaces
        const crossZ = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
        if (crossZ > 0) {
          const avgZ = (p1.z + p2.z + p3.z) / 3;
          const lightness = Math.max(0.02, Math.min(0.12, (avgZ + 2) / 16));
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.fillStyle = `rgba(232, 255, 90, ${lightness})`;
          ctx.fill();
        }
      });

      // 4. Draw glowing wireframe edges
      for (const [a, b] of E) {
        const p = P[a];
        const q = P[b];
        const avgZ = (p.z + q.z) / 2;
        const o = 0.3 + 0.65 * ((avgZ + 2) / 4);

        ctx.strokeStyle = `rgba(232, 255, 90, ${Math.min(o, 0.95)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }

      // 5. Glowing vertex nodes
      P.forEach((p, i) => {
        const isBeacon = i % 3 === 0;
        const r = (isBeacon ? 4.5 : 2.5) * p.f;

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isBeacon ? '#e8ff5a' : 'rgba(232, 255, 90, 0.9)';
        if (isBeacon) {
          ctx.shadowColor = '#e8ff5a';
          ctx.shadowBlur = 14;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // 6. Dual Concentric Orbit Rings (Front Half)
      drawOrbitRing(1.32, -0.45, false, 0.65);
      drawOrbitRing(1.50, 0.55, false, 0.35, true);

      // 7. Kinetic Orbiting Satellites with glowing trails
      // Satellite 1: Electric Lime (fast main ring)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.45);
      const ox1 = Math.cos(tm) * S * 1.32;
      const oy1 = Math.sin(tm) * S * 1.32 * 0.38;

      // Glow halo
      ctx.beginPath();
      ctx.arc(ox1, oy1, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#e8ff5a';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.restore();

      // Satellite 2: Cyan-lime counter-rotating on outer ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.55);
      const ox2 = Math.cos(-tm * 0.75 + 1.2) * S * 1.50;
      const oy2 = Math.sin(-tm * 0.75 + 1.2) * S * 1.50 * 0.38;

      ctx.beginPath();
      ctx.arc(ox2, oy2, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#e8ff5a';
      ctx.shadowColor = '#e8ff5a';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();

      if (!reduce) {
        animId = requestAnimationFrame(draw);
      }
    };

    sz();
    draw();

    const resizeObserver = new ResizeObserver(() => {
      sz();
      if (reduce) draw();
    });
    resizeObserver.observe(cv);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      if (parent) {
        parent.removeEventListener('pointermove', handlePointerMove);
      }
    };
  }, [heroRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        right: '12px',
        top: 0,
        bottom: 0,
        width: '46%',
        height: '100%',
        zIndex: 1,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 0 24px rgba(232, 255, 90, 0.2))'
      }}
    />
  );
};
