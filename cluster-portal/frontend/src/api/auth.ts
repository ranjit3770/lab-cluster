import api from '@/lib/api';

export const authApi = {
  login: (data: FormData) => {
    return api.post('/api/v1/login/access-token', data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  },
  refreshToken: (refreshToken: string) => {
    return api.post('/api/v1/login/refresh-token', { refresh_token: refreshToken });
  },
};
