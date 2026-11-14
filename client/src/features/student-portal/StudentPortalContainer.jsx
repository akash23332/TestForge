import React, { useState, useEffect } from 'react';
import { StudentJoinView } from './StudentJoinView';
import { StudentInstructionsView } from './StudentInstructionsView';
import { StudentExamWorkspace } from './StudentExamWorkspace';
import { StudentResultsView } from './StudentResultsView';

export const StudentPortalContainer = ({ onExitToTeacherPortal, onExit, onBack, initialExamCode = '', currentUser = null }) => {
  const [step, setStep] = useState('join'); // 'join' | 'instructions' | 'workspace' | 'results'
  const [sessionData, setSessionData] = useState(() => {
    try {
      const saved = localStorage.getItem('testforge_student_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [resultData, setResultData] = useState(null);

  // Auto-resume if active workspace session was saved
  useEffect(() => {
    if (sessionData && sessionData.attempt) {
      if (sessionData.token) {
        localStorage.setItem('testforge_attempt_token', sessionData.token);
      }
      if (sessionData.attempt.status === 'SUBMITTED' || sessionData.attempt.status === 'TIMED_OUT') {
        setResultData(sessionData.attempt);
        setStep('results');
      } else {
        setStep('workspace');
      }
    }
  }, []);

  const handleJoined = (data) => {
    if (data.token) {
      localStorage.setItem('testforge_attempt_token', data.token);
    }
    if (data.alreadyCompleted) {
      setResultData(data);
      setStep('results');
      return;
    }
    setSessionData(data);
    localStorage.setItem('testforge_student_session', JSON.stringify(data));
    setStep('instructions');
  };

  const handleStartExam = () => {
    setStep('workspace');
  };

  const handleExamSubmitted = (results) => {
    setResultData(results);
    localStorage.removeItem('testforge_student_session');
    localStorage.removeItem('testforge_attempt_token');
    setStep('results');
  };

  const handleExit = () => {
    localStorage.removeItem('testforge_student_session');
    localStorage.removeItem('testforge_attempt_token');
    setSessionData(null);
    setResultData(null);
    setStep('join');
    if (onBack) {
      onBack();
    } else if (onExit) {
      onExit();
    } else if (onExitToTeacherPortal) {
      onExitToTeacherPortal();
    } else if (window.history.length > 1) {
      window.history.back();
    }
  };

  return (
    <div className="w-full min-h-[90vh]">
      {step === 'join' && (
        <StudentJoinView
          onJoined={handleJoined}
          onBack={handleExit}
          initialExamCode={initialExamCode}
          currentUser={currentUser}
        />
      )}

      {step === 'instructions' && sessionData && (
        <StudentInstructionsView
          sessionData={sessionData}
          onStartExam={handleStartExam}
          onBack={() => setStep('join')}
        />
      )}

      {step === 'workspace' && sessionData && (
        <StudentExamWorkspace
          sessionData={sessionData}
          onExamSubmitted={handleExamSubmitted}
          onExit={handleExit}
        />
      )}

      {step === 'results' && (
        <StudentResultsView
          resultData={resultData}
          onReturnHome={handleExit}
        />
      )}
    </div>
  );
};

export default StudentPortalContainer;
