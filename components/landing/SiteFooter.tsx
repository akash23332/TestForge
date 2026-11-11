import React from 'react';
import { LANDING_COPY } from './constants';

export const SiteFooter: React.FC = () => {
  return (
    <footer className="w-full py-10 border-t border-[#e2e2dc] text-xs text-[#8a8a85] flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
      <div>
        <p className="font-medium text-[#121212]">
          {LANDING_COPY.footer.copyright}
        </p>
      </div>

      <div className="flex items-center gap-6">
        <a href="#privacy" className="hover:text-[#121212] transition-colors">
          Privacy
        </a>
        <a href="#terms" className="hover:text-[#121212] transition-colors">
          Security
        </a>
        <span className="font-mono text-[#121212] font-semibold">
          {LANDING_COPY.footer.tagline}
        </span>
      </div>
    </footer>
  );
};

export default SiteFooter;
