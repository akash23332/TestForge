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
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional().allow(''),
  LLM_PROVIDER: Joi.string().optional().allow(''),
  LLM_API_KEY: Joi.string().optional().allow('')
}).unknown(true);

const { error, value: envVars } = envSchema.validate(process.env, { abortEarly: false });

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
  redis: {
    url: envVars.REDIS_URL || null,
    enabled: Boolean(envVars.REDIS_URL)
  },
  llm: {
    provider: envVars.LLM_PROVIDER || null,
    apiKey: envVars.LLM_API_KEY || null
  }
};

export default config;
