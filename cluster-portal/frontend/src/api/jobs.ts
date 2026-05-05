import api from '@/lib/api';

export const jobsApi = {
    getJobs: (token: string) => 
        api.get('/api/v1/jobs', {
            headers: { Authorization: `Bearer ${token}` }
        }),
    getJob: (token: string, id: number) =>
        api.get(`/api/v1/jobs/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        }),
    submitJob: (token: string, data: any) =>
        api.post('/api/v1/jobs', data, {
            headers: { Authorization: `Bearer ${token}` }
        }),
    deleteJob: (token: string, id: number) =>
        api.delete(`/api/v1/jobs/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        }),
    stopJob: (token: string, id: number) =>
        api.post(`/api/v1/jobs/${id}/stop`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        }),
    getJupyterUrl: (token: string, id: number) =>
        api.get(`/api/v1/jobs/${id}/jupyter-url`, {
            headers: { Authorization: `Bearer ${token}` }
        }),
    bulkDeleteJobs: (token: string, jobIds: (number | string)[]) =>
        api.post('/api/v1/jobs/bulk-delete', { job_ids: jobIds }, {
            headers: { Authorization: `Bearer ${token}` }
        }),
};
