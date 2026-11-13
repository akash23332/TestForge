import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Exam } from '../src/models/Exam.js';
import { Question } from '../src/models/Question.js';
import { User } from '../src/models/User.js';

async function seedExams() {
  try {
    console.log('[SeedExams] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    const teacher = await User.findOne({ role: 'teacher' });
    const teacherId = teacher ? teacher._id : new mongoose.Types.ObjectId();

    const questions = await Question.find({}).limit(4);

    const exam1 = {
      _id: new mongoose.Types.ObjectId('6ae879fe15edfb6d9439efe3'),
      examCode: 'TF-BFD2AD',
      title: 'Data Structures & Algorithms - Mid-Semester Online Test',
      description: 'CS204 - Advanced Data Structures & Algorithms',
      createdBy: teacherId,
      durationMinutes: 90,
      status: 'LIVE',
      totalMarks: 50,
      accessMode: 'PUBLIC_CODE',
      settings: {
        allowRunCode: true,
        showSampleTestResults: true,
        autoSubmitOnTimeUp: true,
        showResultsImmediately: true,
        shuffleQuestions: false
      },
      proctoringSettings: {
        detectTabSwitch: true,
        maxTabSwitchesAllowed: 5,
        enforceFullscreen: false
      },
      sections: [
        {
          name: 'Section A: Problem Solving & Algorithms',
          description: 'Solve the coding problems adhering to time and memory limits.',
          questions: questions.map((q, idx) => ({
            type: 'coding',
            questionId: q._id,
            marks: 10,
            order: idx + 1
          }))
        }
      ]
    };

    const exam2 = {
      _id: new mongoose.Types.ObjectId('6aeb9d4b819522db4b4ea356'),
      examCode: 'TF-452C1A',
      title: 'Programming Foundations & Algorithms Diagnostic',
      description: 'Diagnostic assessment covering arrays, hash tables, and search strategies',
      createdBy: teacherId,
      durationMinutes: 60,
      status: 'LIVE',
      totalMarks: 30,
      accessMode: 'PUBLIC_CODE',
      settings: {
        allowRunCode: true,
        showSampleTestResults: true,
        autoSubmitOnTimeUp: true,
        showResultsImmediately: true,
        shuffleQuestions: false
      },
      proctoringSettings: {
        detectTabSwitch: true,
        maxTabSwitchesAllowed: 5,
        enforceFullscreen: false
      },
      sections: [
        {
          name: 'Coding Evaluation',
          description: 'Implement efficient solutions in your preferred programming language.',
          questions: questions.slice(0, 2).map((q, idx) => ({
            type: 'coding',
            questionId: q._id,
            marks: 15,
            order: idx + 1
          }))
        }
      ]
    };

    await Exam.findByIdAndUpdate(exam1._id, exam1, { upsert: true, new: true });
    await Exam.findByIdAndUpdate(exam2._id, exam2, { upsert: true, new: true });

    console.log('[SeedExams] Successfully seeded 2 live exams into MongoDB Atlas!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[SeedExams] Failed to seed exams:', err);
    process.exit(1);
  }
}

seedExams();
