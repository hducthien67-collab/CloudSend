import React, { useEffect, useRef } from 'react';

interface SilkFabricBackgroundProps {
  className?: string;
  accentColor?: string;
}

/**
 * Hiệu ứng nền chuyển động uốn lượn như tấm vải lụa cuộn mềm mại từ góc trên xuống góc dưới.
 * Đã tối ưu hóa hoàn toàn:
 * - Không bị giật giật (Smooth continuous trigonometric wave curves, không nhảy pha).
 * - Sử dụng Canvas 60fps GPU-accelerated mượt mà như lụa.
 * - Tự động dừng vòng lặp khi tab ẩn (document.hidden) để chống giật lag và bảo vệ pin/CPU.
 */
export const SilkFabricBackground: React.FC<SilkFabricBackgroundProps> = ({
  className = "absolute inset-0 pointer-events-none overflow-hidden"
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number | null = null;
    let isPaused = false;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize, { passive: true });

    // Dừng vòng lặp khi chuyển tab trình duyệt
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true;
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      } else {
        if (isPaused) {
          isPaused = false;
          lastTime = performance.now();
          animationFrameId = requestAnimationFrame(render);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cấu hình 3 dải lụa satin ngọc lục bảo lướt từ góc trên trái xuống góc dưới phải
    // Sử dụng sóng sin liên tục và vận tốc mượt mà, không bao giờ bị giật hoặc đứt quãng
    const ribbons = [
      { speed: 0.00065, freq: 0.0022, amp: 48, depth: 220, baseOpacity: 0.08, hue: 160 },
      { speed: 0.00085, freq: 0.0018, amp: 62, depth: 280, baseOpacity: 0.06, hue: 172 },
      { speed: 0.00055, freq: 0.0026, amp: 42, depth: 200, baseOpacity: 0.07, hue: 154 }
    ];

    let time = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      if (isPaused || document.hidden) return;

      const delta = Math.min(32, now - lastTime);
      lastTime = now;
      time += delta;

      ctx.clearRect(0, 0, width, height);

      // Điểm bắt đầu (góc trên bên trái ngoài khung) và điểm kết thúc (góc dưới bên phải ngoài khung)
      const startX = -120;
      const startY = -120;
      const endX = width + 120;
      const endY = height + 120;

      const dx = endX - startX;
      const dy = endY - startY;
      const length = Math.sqrt(dx * dx + dy * dy) || 1000;
      const ux = dx / length;
      const uy = dy / length;
      // Vector vuông góc để tạo độ uốn cong sóng lụa
      const nx = -uy;
      const ny = ux;

      const steps = 28; // Đủ điểm để đường cong quadratic mượt mà mà cực nhẹ CPU

      ribbons.forEach((ribbon, rIndex) => {
        ctx.save();
        ctx.beginPath();

        const phaseOffset = rIndex * 2.1;
        const currentPhase = time * ribbon.speed + phaseOffset;

        const topPoints: { x: number; y: number }[] = [];
        const bottomPoints: { x: number; y: number }[] = [];

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const distAlong = t * length;

          // Đường trục trung tâm
          const cx = startX + ux * distAlong;
          const cy = startY + uy * distAlong;

          // Uốn lượn hình sin mềm mại liên tục
          const wave1 = Math.sin(distAlong * ribbon.freq + currentPhase) * ribbon.amp;
          const wave2 = Math.sin(distAlong * ribbon.freq * 0.5 - currentPhase * 0.7) * (ribbon.amp * 0.4);
          const displacement = wave1 + wave2;

          // Điểm mép trên của dải lụa
          topPoints.push({
            x: cx + nx * displacement,
            y: cy + ny * displacement
          });

          // Điểm mép dưới của dải lụa với độ dày satin mềm mại
          const ribbonDepth = ribbon.depth * (0.8 + 0.2 * Math.sin(distAlong * 0.003 + currentPhase));
          bottomPoints.push({
            x: cx + nx * (displacement + ribbonDepth),
            y: cy + ny * (displacement + ribbonDepth)
          });
        }

        // Vẽ mép trên với đường cong Bezier
        ctx.moveTo(topPoints[0].x, topPoints[0].y);
        for (let i = 1; i < topPoints.length - 1; i++) {
          const mx = (topPoints[i].x + topPoints[i + 1].x) / 2;
          const my = (topPoints[i].y + topPoints[i + 1].y) / 2;
          ctx.quadraticCurveTo(topPoints[i].x, topPoints[i].y, mx, my);
        }
        ctx.lineTo(topPoints[topPoints.length - 1].x, topPoints[topPoints.length - 1].y);

        // Nối sang mép dưới
        ctx.lineTo(bottomPoints[bottomPoints.length - 1].x, bottomPoints[bottomPoints.length - 1].y);

        // Vẽ ngược lại mép dưới
        for (let i = bottomPoints.length - 2; i > 0; i--) {
          const mx = (bottomPoints[i].x + bottomPoints[i - 1].x) / 2;
          const my = (bottomPoints[i].y + bottomPoints[i - 1].y) / 2;
          ctx.quadraticCurveTo(bottomPoints[i].x, bottomPoints[i].y, mx, my);
        }
        ctx.lineTo(bottomPoints[0].x, bottomPoints[0].y);
        ctx.closePath();

        // Tạo Gradient màu lụa ngọc lục bảo mượt mà từ trên xuống
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, `hsla(${ribbon.hue}, 85%, 55%, 0)`);
        grad.addColorStop(0.3, `hsla(${ribbon.hue}, 80%, 50%, ${ribbon.baseOpacity * 0.9})`);
        grad.addColorStop(0.6, `hsla(${ribbon.hue + 10}, 90%, 65%, ${ribbon.baseOpacity * 1.5})`);
        grad.addColorStop(0.85, `hsla(${ribbon.hue - 8}, 75%, 45%, ${ribbon.baseOpacity * 0.8})`);
        grad.addColorStop(1, `hsla(${ribbon.hue}, 80%, 40%, 0)`);

        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div className={className} aria-hidden="true">
      {/* Dynamic Smooth Canvas Simulation */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block opacity-90 pointer-events-none transform-gpu"
      />

      {/* Tầng ánh sáng mềm mại từ góc trên xuống góc dưới */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-teal-500/5 mix-blend-screen pointer-events-none" />

      {/* Hào quang lụa trung tâm nhẹ nhàng không giật */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/[0.04] rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-teal-500/[0.03] rounded-full blur-3xl pointer-events-none translate-y-1/2 -translate-x-1/3" />
    </div>
  );
};
