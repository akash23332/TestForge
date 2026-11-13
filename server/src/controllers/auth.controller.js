import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { ExamAttempt } from '../models/ExamAttempt.js';
import { config } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      throw ApiError.conflict('An account with this email address already exists.');
    }

    // Public registration strictly provisions student accounts only.
    // Teachers and Admins must be provisioned via authorized invitation/admin workflows.
    const assignedRole = 'student';

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name: name?.trim(),
      email: cleanEmail,
      passwordHash,
      role: assignedRole
    });

    const token = generateToken(user);

    return ApiResponse.success(
      res,
      201,
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt
        },
        token
      },
      'Account registered successfully'
    );
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    // Role verification: ensure user account matches the expected portal tab
    if (role) {
      const expectedRole = String(role).trim().toLowerCase();
      const userRole = String(user.role || '').toLowerCase();

      if ((expectedRole === 'teacher' || expectedRole === 'faculty') && userRole !== 'teacher' && userRole !== 'admin') {
        throw ApiError.forbidden('This account is not registered as faculty.');
      }

      if ((expectedRole === 'student' || expectedRole === 'candidate') && userRole !== 'student') {
        throw ApiError.forbidden('This account is not registered as a student.');
      }
    }

    // Check account status if configured
    if (user.isActive === false || user.status === 'disabled') {
      throw ApiError.forbidden('Your account has not been approved or has been disabled.');
    }

    const token = generateToken(user);

    return ApiResponse.success(
      res,
      200,
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt
        },
        token
      },
      'Login successful'
    );
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    return ApiResponse.success(
      res,
      200,
      {
        user: req.user
      },
      'Teacher profile retrieved'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve real students from the database along with real examination performance metrics
 */
export const getStudents = async (req, res, next) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('name email role cohort rollNumber createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const studentEmails = students.map((s) => s.email.toLowerCase());
    const studentIds = students.map((s) => s._id);

    const attempts = await ExamAttempt.find({
      $or: [
        { studentId: { $in: studentIds } },
        { 'candidateInfo.email': { $in: studentEmails } }
      ]
    })
      .select('studentId candidateInfo.email status score percentage createdAt')
      .lean();

    const attemptsByStudent = {};
    for (const a of attempts) {
      const email = a.candidateInfo?.email?.toLowerCase();
      const sId = a.studentId?.toString();
      if (sId) {
        if (!attemptsByStudent[sId]) attemptsByStudent[sId] = [];
        attemptsByStudent[sId].push(a);
      }
      if (email) {
        if (!attemptsByStudent[email]) attemptsByStudent[email] = [];
        attemptsByStudent[email].push(a);
      }
    }

    const enhanced = students.map((s) => {
      const atts = attemptsByStudent[s._id.toString()] || attemptsByStudent[s.email.toLowerCase()] || [];
      const completed = atts.filter((a) => a.status === 'SUBMITTED' || a.status === 'submitted');
      const avg = completed.length > 0
        ? Math.round(completed.reduce((acc, curr) => acc + (curr.percentage ?? curr.score ?? 0), 0) / completed.length)
        : 0;

      return {
        _id: s._id,
        id: s._id.toString(),
        name: s.name || s.email.split('@')[0],
        email: s.email,
        cohort: s.cohort || 'CS-2026',
        rollNo: s.rollNumber || `TF-${s._id.toString().slice(-4).toUpperCase()}`,
        status: atts.length > 0 ? 'ACTIVE' : 'IDLE',
        avgScore: avg,
        testsCount: atts.length,
        integrityRate: 100,
        lastActive: atts[0]?.createdAt ? new Date(atts[0].createdAt).toLocaleDateString() : 'Never',
        createdAt: s.createdAt
      };
    });

    return ApiResponse.success(res, 200, enhanced, 'Students retrieved from database successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Register or provision a new student into the institutional roster
 */
export const createStudent = async (req, res, next) => {
  try {
    const { name, email, cohort, rollNo, password = 'Student@123' } = req.body;
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    if (!cleanEmail) {
      throw ApiError.badRequest('Student email is required.');
    }

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      throw ApiError.conflict('A user with this email address already exists.');
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name: (name || cleanEmail.split('@')[0]).trim(),
      email: cleanEmail,
      passwordHash,
      role: 'student',
      cohort: cohort || 'CS-2026 A',
      rollNumber: rollNo || `TF-${Math.floor(1000 + Math.random() * 9000)}`
    });

    return ApiResponse.success(
      res,
      201,
      {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        cohort: user.cohort,
        rollNo: user.rollNumber,
        status: 'IDLE',
        avgScore: 0,
        testsCount: 0,
        integrityRate: 100,
        lastActive: 'Just registered',
        createdAt: user.createdAt
      },
      'Student enrolled successfully.'
    );
  } catch (error) {
    next(error);
  }
};

export default {
  register,
  login,
  getMe,
  getStudents,
  createStudent
};
