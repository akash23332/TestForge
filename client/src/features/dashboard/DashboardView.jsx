import React from 'react';
import HeroScroll from '../../components/ui/hero-scroll';
import { LandingBelowHero } from '../../components/landing/LandingBelowHero';

const TEACHER_ROTATING_WORDS = [
  'assessments.',
  'evaluations.',
  'standards.',
  'curriculum.',
  'integrity.',
];

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
        eyebrowBadge="Educator Workspace"
        line1="Author tests."
        line2="Enforce integrity."
        line3Prefix="Elevate your "
        rotatingWords={TEACHER_ROTATING_WORDS}
        subtext="Author multi-language coding challenges and MCQs, harden test suites with AST mutation, and evaluate student submissions in a zero-leak sandbox."
        primaryCtaLabel="+ Create Question →"
        onPrimaryCta={() => onNavigate && onNavigate('create')}
        secondaryCtaLabel="Question Bank ↓"
        onSecondaryCta={() => {
          if (onNavigate) {
            onNavigate('bank');
          } else {
            const el = document.getElementById('landing-content') || document.getElementById('platform-overview');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }
        }}
        bottomTagline={
          <>
            Multi-Language Sandbox <span className="text-[#EDFF72]">·</span> AST Mutation Testing <span className="text-[#EDFF72]">·</span> Zero-Leak Security <span className="text-[#EDFF72]">·</span> Automated Grading
          </>
        }
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
