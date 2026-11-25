/**
 * Global Platform Security Policy — Secure Exam Mode
 *
 * Mandatory across ALL examinations in TestForge.
 * Teachers do not configure per-exam security toggles; every published
 * exam automatically inherits and operates under this unified policy.
 */
export const GLOBAL_SECURE_EXAM_POLICY = Object.freeze({
  mode: 'SECURE_EXAM_MODE',
  version: '2.1.0',
  enforceFullscreen: true,
  detectTabSwitch: true,
  detectWindowBlur: true,
  detectFullscreenExit: true,
  preventClipboard: true,
  preventContextMenu: true,
  enableActivityLogging: true,
  autosaveEnabled: true,
  autosaveIntervalSeconds: 5,
  warningThreshold: 1,
  finalWarningThreshold: 2,
  lockThreshold: 3,
  autoSubmitThreshold: 4,
  maxTabSwitches: 4,
  reviewThreshold: 3,
  reviewThresholdViolations: 3,
  autoSubmitReason: 'Exceeded maximum permitted tab switches (4 violations)',
  graduatedPolicy: {
    level1: 'First Warning: Tab switch or focus loss detected. Please return to your exam. Further tab switches will lead to exam lock and automatic submission.',
    level2: 'Final Warning: Second tab switch detected. The next tab switch will lock your exam interface, and a fourth will automatically submit your exam.',
    level3: 'Exam Locked: Repeated tab switching detected (3 violations). Your session is temporarily locked and flagged for teacher review. Answers are safely saved.',
    level4: 'Exam Auto-Submitted: Maximum tab switch limit reached (4 violations). Your exam has been automatically submitted and flagged for instructor review.'
  }
});

/**
 * Returns the effective platform security policy for any exam.
 * Guarantees that even legacy or third-party imported exams adhere to Global Secure Exam Mode.
 */
export const getEffectiveSecurityPolicy = (exam = {}) => {
  return {
    ...GLOBAL_SECURE_EXAM_POLICY,
    examId: exam._id || exam.id,
    examCode: exam.examCode
  };
};

export default GLOBAL_SECURE_EXAM_POLICY;
