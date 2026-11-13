import dotenv from 'dotenv';
import Joi from 'joi';

// Load .env file
dotenv.config();

const envSchema = Joi.object({
  PORT: Joi.number().default(5000),
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  MONGODB_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required().messages({
    'any.required': 'MONGODB_URI is required to run the TestForge server.',
    'string.uri': 'MONGODB_URI must be a valid MongoDB connection string.'
  }),
  JWT_SECRET: Joi.string().min(16).required().messages({
    'any.required': 'JWT_SECRET is required for token signing and authentication security.',
    'string.min': 'JWT_SECRET must be at least 16 characters long.'
  }),
  JWT_EXPIRES_IN: Joi.string().default('30d'),
  CLIENT_ORIGIN: Joi.string().default('http://localhost:5173'),
  LLM_PROVIDER: Joi.string().optional().allow(''),
  LLM_API_KEY: Joi.string().optional().allow(''),
  REDIS_URL: Joi.string().optional().allow('').default('redis://127.0.0.1:6379'),
  VALKEY_URL: Joi.string().optional().allow(''),
  EXECUTION_PROVIDER: Joi.string().valid('mock', 'local', 'render_sandbox', 'onlinecompiler').default(
    process.env.NODE_ENV === 'production' ? 'mock' : 'mock'
  ),
  ALLOW_LOCAL_EXECUTION: Joi.boolean().default(false),
  RENDER_SANDBOX_ENDPOINT: Joi.string().uri().optional().allow(''),
  RENDER_SANDBOX_API_KEY: Joi.string().optional().allow(''),
  ONLINE_COMPILER_ENDPOINT: Joi.string().uri().optional().allow('').default('https://api.onlinecompiler.io/api/run-code-sync/'),
  ONLINE_COMPILER_API_KEY: Joi.string().optional().allow(''),
  ONLINE_COMPILER_TIMEOUT_MS: Joi.number().optional().default(10000)
}).unknown(true);

const { error, value: envVars } = envSchema.validate(process.env, { abortEarly: false });

// CRITICAL SECURITY ENFORCEMENT: Never permit unsafe LocalExecutionProvider in production
if (envVars.NODE_ENV === 'production' && envVars.EXECUTION_PROVIDER === 'local') {
  console.error('\x1b[31m[FATAL SECURITY ERROR] LocalExecutionProvider cannot be used in production.\n' +
    'Untrusted code execution on the host server is strictly prohibited.\n' +
    'Set EXECUTION_PROVIDER=mock or configure an isolated RENDER_SANDBOX_ENDPOINT.\x1b[0m');
  process.exit(1);
}

if (envVars.EXECUTION_PROVIDER === 'local' && !envVars.ALLOW_LOCAL_EXECUTION && envVars.NODE_ENV !== 'test') {
  console.error('\x1b[31m[CONFIG ERROR] Local code execution requires explicit ALLOW_LOCAL_EXECUTION=true flag in development.\x1b[0m');
  process.exit(1);
}

if (error) {
  const missingOrInvalid = error.details.map((detail) => detail.message).join('\n  - ');
  console.error(`\x1b[31m[CONFIG ERROR] Invalid environment configuration:\n  - ${missingOrInvalid}\x1b[0m`);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

export const config = {
  port: envVars.PORT,
  env: envVars.NODE_ENV,
  mongodb: {
    uri: envVars.MONGODB_URI
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN
  },
  clientOrigin: envVars.CLIENT_ORIGIN,
  llm: {
    provider: envVars.LLM_PROVIDER || null,
    apiKey: envVars.LLM_API_KEY || null
  },
  redis: {
    url: envVars.VALKEY_URL || envVars.REDIS_URL || 'redis://127.0.0.1:6379'
  },
  execution: {
    provider: envVars.EXECUTION_PROVIDER,
    allowLocal: Boolean(envVars.ALLOW_LOCAL_EXECUTION),
    sandboxEndpoint: envVars.RENDER_SANDBOX_ENDPOINT || null,
    sandboxApiKey: envVars.RENDER_SANDBOX_API_KEY || null,
    onlineCompilerEndpoint: envVars.ONLINE_COMPILER_ENDPOINT || 'https://api.onlinecompiler.io/api/run-code-sync/',
    onlineCompilerApiKey: envVars.ONLINE_COMPILER_API_KEY || null,
    onlineCompilerTimeoutMs: envVars.ONLINE_COMPILER_TIMEOUT_MS || 10000
  }
};

export default config;
