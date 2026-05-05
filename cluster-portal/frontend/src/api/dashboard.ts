import api from '@/lib/api';

export const dashboardApi = {
  getStats: (token: string) => {
    return api.get('/api/v1/system-info/overview', {
        headers: { Authorization: `Bearer ${token}` }
    });
  },
};
