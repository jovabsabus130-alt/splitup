import axios from 'axios';

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
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
      localStorage.removeItem('token');
      localStorage.removeItem('splitup_token');
      localStorage.removeItem('splitup_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
