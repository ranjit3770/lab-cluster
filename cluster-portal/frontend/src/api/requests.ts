import api from '@/lib/api';
import type { StorageRequestPayload, StorageRequestStatus } from './types';

export const requestsApi = {
    getRequests: (token: string) => 
        api.get('/api/v1/requests/', {
            headers: { Authorization: `Bearer ${token}` }
        }),
    getRequest: (token: string, id: number) =>
        api.get(`/api/v1/requests/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        }),
    createRequest: (token: string, data: StorageRequestPayload) =>
        api.post('/api/v1/requests/', data, {
            headers: { Authorization: `Bearer ${token}` }
        }),
    updateRequest: (token: string, id: number, data: StorageRequestStatus) =>
        api.put(`/api/v1/requests/${id}`, data, {
            headers: { Authorization: `Bearer ${token}` }
        }),
};
