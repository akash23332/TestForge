import axios from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
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
