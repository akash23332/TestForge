import React from 'react';

export const SiteFooter: React.FC = () => {
  return (
    <div className="w-full pt-16 pb-8 select-none overflow-hidden">
      <style>{`
        @keyframes tfWordmarkWash {
          from { background-position: 150% 0; }
          to { background-position: -150% 0; }
        }
        .tf-footer-wordmark {
          font-family: 'Plus Jakarta Sans', Inter, system-ui, -apple-system, sans-serif;
          font-weight: 700;
          font-size: clamp(70px, 18vw, 280px);
          line-height: 0.9;
          letter-spacing: -0.07em;
          text-align: center;
          margin: 0;
          color: transparent;
          -webkit-text-stroke: 1.5px rgba(23, 24, 25, 0.22);
          background: linear-gradient(100deg, transparent 40%, #EDFF72 50%, transparent 60%) 0 0 / 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          animation: tfWordmarkWash 7s linear infinite;
          overflow: hidden;
          white-space: nowrap;
          user-select: none;
          pointer-events: none;
        }
      `}</style>

      {/* Giant Outlined Sweeping Lime Wordmark */}
      <div className="tf-footer-wordmark" aria-hidden="true">
        TestForge
      </div>

      {/* Bottom Legal & Tagline Row */}
      <footer className="w-full mt-4 pt-6 border-t border-[#e2e2dc] text-xs text-[#8a8a85] flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="font-medium text-[#121212]">© 2026 TestForge</span>
        <span className="text-[#666] font-normal">
          Take tests · Track growth · Own your results
        </span>
      </footer>
    </div>
  );
};

export default SiteFooter;
