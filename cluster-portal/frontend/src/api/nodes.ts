import api from '@/lib/api';

export const nodesApi = {
    getNodes: (token: string) => 
        api.get('/api/v1/compute-resources/', {
            headers: { Authorization: `Bearer ${token}` }
        }),
    getNode: (token: string, id: number) =>
        api.get(`/api/v1/compute-resources/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        }),
};
