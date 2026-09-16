import axios from 'axios';
import { formatErrorMessage } from './formatError';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
});

api.interceptors.request.use(async (config) => {
  let token = localStorage.getItem('splitup_token') || localStorage.getItem('token');

  // If using Clerk, dynamically grab the active session token if available
  if (window.Clerk && window.Clerk.session) {
    try {
      const clerkToken = await window.Clerk.session.getToken();
      if (clerkToken) token = clerkToken;
    } catch {}
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 1. Automatic session expiration redirection
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
      localStorage.removeItem('token');
      localStorage.removeItem('splitup_token');
      localStorage.removeItem('splitup_user');
      window.location.href = '/login';
    }

    // 2. Sanitize and mask all error responses to prevent exposing technical details
    const userFriendlyMessage = formatErrorMessage(error);
    error.userMessage = userFriendlyMessage;
    if (error.response) {
      if (!error.response.data || typeof error.response.data !== 'object') {
        error.response.data = { message: userFriendlyMessage };
      } else {
        error.response.data.message = userFriendlyMessage;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
