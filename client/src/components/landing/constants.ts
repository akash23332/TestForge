export interface NavModule {
  id: string;
  name: string;
}

export interface MarqueeItem {
  id: string;
  label: string;
}

export interface StepItem {
  number: string;
  title: string;
  description: string;
}

export interface StatItem {
  value: number;
  suffix?: string;
  label: string;
  description: string;
}

export interface NotificationItem {
  id: string;
  text: string;
  badge: string;
  icon: 'check' | 'zap' | 'code' | 'users';
}

export const LANDING_COPY = {
  productShowcase: {
    eyebrow: 'The workspace',
    h2Prefix: 'One place for every ',
    h2Highlight: 'assessment',
    h2Suffix: '.',
    lead: 'Author deterministic coding challenges, verify tests with AST mutation, and auto-evaluate students in a secure, zero-leak execution sandbox.',
  },
  mock: {
    title: 'Your Assessment ✦ Workspace',
    createCta: '+ Create Assessment',
    tabs: [
      'Overview',
      'Question Bank',
      'Test Studio',
      'Mutation Lab',
      'Paper Designer',
      'Examinations',
    ],
    floatingLeft: [
      'Exam published',
      'Student submitted',
      'Paper exported',
      'Score synced',
    ],
    floatingRight: [
      '12 questions added',
      'Mutation caught',
      '3 MCQs imported',
      'New cohort joined',
    ],
  },
  marquee: [
    'Question Bank',
    'Test Studio',
    'Mutation Lab',
    'Bulk MCQ',
    'Paper Designer',
    'Examinations',
  ],
  features: {
    eyebrow: 'Features',
    h2Prefix: 'Built for how teachers ',
    h2Highlight: 'really',
    h2Suffix: ' work.',
    lead: 'Designed alongside computer science faculty to eliminate grading drift and stop cheating without intrusive malware.',
  },
  howItWorks: {
    eyebrow: 'Workflow',
    h2: 'From concept to evaluated cohort in three steps.',
    steps: [
      {
        number: '01',
        title: 'Build your questions',
        description:
          'Create algorithmic problems or import bulk MCQs. Configure sample and hidden boundary test cases with automatic solution validation.',
      },
      {
        number: '02',
        title: 'Assemble the assessment',
        description:
          'Use the visual Paper Designer to bundle coding challenges and MCQs into timed, proctored examinations with custom grading weights.',
      },
      {
        number: '03',
        title: 'Monitor and improve',
        description:
          'Distribute unique examination codes. Watch live progress in the teacher portal and run AST mutation tests to eliminate loophole answers.',
      },
    ] as StepItem[],
  },
  stats: [
    {
      value: 1000,
      suffix: '+',
      label: 'Verified test runs',
      description: 'Executed in isolated multi-language containers every day.',
    },
    {
      value: 72,
      suffix: '%',
      label: 'Faster grading cycle',
      description: 'Immediate automated feedback for both students and faculty.',
    },
    {
      value: 100,
      suffix: '%',
      label: 'Zero-leak security',
      description: 'Hidden test inputs and reference solutions never reach client browsers.',
    },
  ] as StatItem[],
  cta: {
    h2: 'Ready to forge your next assessment?',
    subtext:
      'Join computer science departments delivering rigorous, tamper-proof programming exams.',
    primaryButton: 'Get started free',
    secondaryButton: 'Book a demo',
  },
  footer: {
    copyright: `© ${new Date().getFullYear()} TestForge Inc. All rights reserved.`,
    tagline: 'Precision testing for computer science education.',
  },
};
