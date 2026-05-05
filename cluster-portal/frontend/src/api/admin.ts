import api from '@/lib/api';

export const adminApi = {
    getUsers: (token: string) => api.get('/api/v1/users/', {
        headers: { Authorization: `Bearer ${token}` }
    }),
    createUser: (token: string, data: any) => api.post('/api/v1/users/', data, {
        headers: { Authorization: `Bearer ${token}` }
    })
}
