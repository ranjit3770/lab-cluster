import api from '@/lib/api';
import type { UserPayload } from './types';

export const userApi = {
    getProfile: (token: string) => api.get('/api/v1/users/me', {
         headers: { Authorization: `Bearer ${token}` }
    }),
    getDashboardStats: (token: string) => api.get('/api/v1/users/me/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
    }),
    getUsers: (token: string) => api.get('/api/v1/users/', {
        headers: { Authorization: `Bearer ${token}` }
    }),
    updateUser: (token: string, id: number, data: Partial<UserPayload>) => api.put(`/api/v1/users/${id}`, data, {
        headers: { Authorization: `Bearer ${token}` }
    }),
    deleteUser: (token: string, id: number) => api.delete(`/api/v1/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
    }),
    createUser: (token: string, data: UserPayload) => api.post('/api/v1/users/', data, {
        headers: { Authorization: `Bearer ${token}` }
    }),
}
