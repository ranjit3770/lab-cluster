import api from '@/lib/api';

export const feedbackApi = {
    submitFeedback: (token: string, data: { type: string, subject: string, message: string, category: string }) => 
        api.post('/api/v1/feedback/', data, {
            headers: { Authorization: `Bearer ${token}` }
        }),
};
