import React from 'react';
import HeroScroll from '../../components/ui/hero-scroll';
import { LandingBelowHero } from '../../components/landing/LandingBelowHero';

export const DashboardView = ({
  questions = [],
  onNavigate,
  onSelectQuestion,
  currentUser,
  health,
  onOpenProfile,
  onLogout,
}) => {
  return (
    <div className="w-full">
      <HeroScroll
        primaryCtaLabel="Create Assessment"
        onPrimaryCta={() => onNavigate && onNavigate('create')}
        secondaryCtaLabel="Explore ↓"
        onSecondaryCta={() => {
          const el = document.getElementById('landing-content') || document.getElementById('platform-overview');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
        onNavigateModule={(mod) => onNavigate && onNavigate(mod)}
      >
        <LandingBelowHero
          onGetStarted={() => onNavigate && onNavigate('create')}
          onBookDemo={() => onNavigate && onNavigate('exams')}
          onNavigate={onNavigate}
          currentUser={currentUser}
          onOpenProfile={onOpenProfile}
          onLogout={onLogout}
        />
      </HeroScroll>
    </div>
  );
};

export default DashboardView;
