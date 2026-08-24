import api from '@/lib/api';
import type { UserPayload } from './types';

export const adminApi = {
    getUsers: (token: string) => api.get('/api/v1/users/', {
        headers: { Authorization: `Bearer ${token}` }
    }),
    createUser: (token: string, data: UserPayload) => api.post('/api/v1/users/', data, {
        headers: { Authorization: `Bearer ${token}` }
    })
}
