import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import { requestCorrelation } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.routes.js';
import authRouter from './routes/auth.routes.js';
import questionRouter from './routes/question.routes.js';
import mcqRouter from './routes/mcq.routes.js';

const app = express();

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) or matching origin
      if (!origin || origin === config.clientOrigin || config.env === 'development') {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id']
  })
);

// Body parsing with safe size bounds
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request correlation & logging
app.use(requestCorrelation);
if (config.env !== 'test') {
  app.use(morgan(':method :url :status :res[content-length] - :response-time ms [req-id: :res[x-request-id]]'));
}

// Base welcome route
app.get('/', (req, res) => {
  res.json({
    name: 'TestForge API',
    description: 'AI-assisted Coding Assessment Preparation & Validation Platform',
    version: '1.0.0',
    documentation: '/api/v1/docs',
    healthCheck: '/api/v1/health'
  });
});

// Mount /api/v1 subrouters
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/questions', questionRouter);
app.use('/api/v1/mcq', mcqRouter);
app.use('/api/v1/mcq-imports', mcqRouter);

// Catch 404 and route to error handler
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

export default app;
