import axios from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

// Interceptor to attach JWT token if present in localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('testforge_token');
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
    const formattedMessage = errorData?.message || error.message || 'An unexpected error occurred';
    return Promise.reject({
      ...error,
      customMessage: formattedMessage,
      code: errorData?.code || 'NETWORK_ERROR',
      details: errorData?.details
    });
  }
);

export default api;
