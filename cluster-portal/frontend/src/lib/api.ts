import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 403 (Forbidden) and not already retrying
    // Note: We use 403 for credential failure as per current backend logic in deps.py
    if (error.response?.status === 403 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');

      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/api/v1/login/refresh-token`, {
            refresh_token: refreshToken,
          });

          const { access_token, refresh_token } = response.data;
          
          localStorage.setItem('token', access_token);
          localStorage.setItem('refreshToken', refresh_token);
          
          // Update the original request with new token
          originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh token expired or invalid
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }

    // Global Maintenance Mode Detection
    if (error.response?.status === 503 && error.response?.data?.maintenance) {
      if (window.location.pathname !== '/maintenance') {
        window.location.href = '/maintenance';
      }
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
