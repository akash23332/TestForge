import axios from 'axios';

/**
 * Resolves the centralized API base URL for TestForge.
 * - Reads VITE_API_URL from environment variables (e.g. from Vercel or .env.production).
 * - Normalizes trailing slashes and guarantees exactly one '/api/v1' path prefix without duplication.
 * - In production, defaults directly to the Render backend (https://testforge-api-eayz.onrender.com/api/v1)
 *   to prevent silent Vercel-relative 404 errors.
 * - In local development, falls back to relative '/api/v1' (proxied by Vite to http://localhost:5001).
 */
export const getBaseUrl = (envApiUrl = import.meta.env.VITE_API_URL, isProd = import.meta.env.PROD) => {
  const trimmed = typeof envApiUrl === 'string' ? envApiUrl.trim() : '';

  if (trimmed) {
    const cleanUrl = trimmed.replace(/\/+$/, '');
    return cleanUrl.endsWith('/api/v1') ? cleanUrl : `${cleanUrl}/api/v1`;
  }

  // Production fallback: strictly route to the live Render backend
  if (isProd) {
    return 'https://testforge-api-eayz.onrender.com/api/v1';
  }

  // Development fallback: relative path handled by Vite dev server proxy
  return '/api/v1';
};

export const api = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 60000 // Global default 60s (specific AI requests override via getAiTimeout)
});

// Interceptor to attach JWT token or scoped Attempt Session token if present in localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('testforge_token') || localStorage.getItem('testforge_attempt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor to handle responses and normalize errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorData = error.response?.data?.error;
    const isTimeout = error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'));

    let formattedMessage = errorData?.message || error.message || 'An unexpected error occurred';
    if (isTimeout) {
      formattedMessage = 'The AI generation request took longer than expected to formulate. Your existing work is safe. Please retry or adjust parameters.';
    }

    return Promise.reject({
      ...error,
      customMessage: formattedMessage,
      code: isTimeout ? 'TIMEOUT_EXCEEDED' : (errorData?.code || 'NETWORK_ERROR'),
      details: errorData?.details,
      isTimeout
    });
  }
);

export default api;
