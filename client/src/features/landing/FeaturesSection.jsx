import React, { useState, useRef } from 'react';
import {
  Sparkles,
  BookOpen,
  Code2,
  FlaskConical,
  FileText,
  BarChart3,
  ArrowRight
} from 'lucide-react';

const FeatureCard = ({ icon: Icon, title, description, tag }) => {
  const cardRef = useRef(null);
  const [style, setStyle] = useState({});
  const [spotlight, setSpotlight] = useState({ opacity: 0, x: 50, y: 50 });

  const handlePointerMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setSpotlight({ opacity: 1, x: x * 100, y: y * 100 });
    setStyle({
      transform: `perspective(900px) rotateX(${(0.5 - y) * 8}deg) rotateY(${(x - 0.5) * 8}deg) translateY(-4px)`,
      transition: 'transform 0.1s ease-out'
    });
  };

  const handlePointerLeave = () => {
    setSpotlight({ opacity: 0, x: 50, y: 50 });
    setStyle({
      transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)',
      transition: 'transform 0.3s ease-out'
    });
  };

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={style}
      className="relative rounded-[28px] border border-[#DDE1DA] bg-white p-7 shadow-xs overflow-hidden isolation-isolate transition-shadow duration-300 hover:shadow-[0_24px_50px_-20px_rgba(23,24,25,0.12)] flex flex-col justify-between min-h-[260px] group"
    >
      {/* Content */}
      <div className="relative z-10 mt-6">
        <h3 className="text-xl font-bold tracking-tight text-[#171819]">
          {title}
        </h3>
        <p className="mt-2 text-sm text-[#666B66] leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
};

export const FeaturesSection = () => {
  const features = [
    {
      icon: Sparkles,
      title: 'AI Question Generator',
      description:
        'Generate questions from selected topics, difficulty levels and question types using AI.',
      tag: 'SYNTHESIS'
    },
    {
      icon: BookOpen,
      title: 'Smart Question Bank',
      description:
        'Organize, categorize and reuse questions across multiple assessments and semesters.',
      tag: 'ORGANIZATION'
    },
    {
      icon: Code2,
      title: 'Coding Test Studio',
      description:
        'Create programming challenges with test cases, time limits and automated evaluation.',
      tag: 'SANDBOX'
    },
    {
      icon: FlaskConical,
      title: 'Mutation Lab',
      description:
        'Evaluate the effectiveness of test cases through mutation testing and AST fuzzing.',
      tag: 'INTEGRITY'
    },
    {
      icon: FileText,
      title: 'Paper Designer',
      description:
        'Design structured examination papers using selected questions and custom marking schemes.',
      tag: 'ASSEMBLY'
    },
    {
      icon: BarChart3,
      title: 'Performance Analytics',
      description:
        'Understand student scores, assessment performance and class progress through visual analytics.',
      tag: 'TELEMETRY'
    }
  ];

  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="max-w-2xl mb-14">
        <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold tracking-widest text-[#777D78] uppercase">
          <span className="w-5 h-[2px] bg-[#171819]" />
          <span>What Can You Do With TestForge?</span>
        </div>
        <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#171819] leading-[1.08]">
          Six tools. One{' '}
          <span className="relative inline-block px-1.5 py-0.5 rounded-lg bg-[#EDFF72] text-[#111]">
            workspace.
          </span>
        </h2>
        <p className="mt-3 text-base sm:text-lg text-[#666B66]">
          Everything you need to build, run and review assessments with institutional certitude.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((item, index) => (
          <FeatureCard key={index} {...item} />
        ))}
      </div>
    </section>
  );
};
