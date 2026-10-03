import { api } from './api'

export interface FeedbackPayload {
  message: string
  page: string
}

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  await api.post('/feedback', payload)
}
