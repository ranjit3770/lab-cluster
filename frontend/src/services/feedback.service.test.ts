import { describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { submitFeedback } from './feedback.service'

describe('submitFeedback', () => {
  it('POSTs the payload to /feedback', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: null })

    await submitFeedback({ message: 'hi', page: '/user' })

    expect(post).toHaveBeenCalledWith('/feedback', { message: 'hi', page: '/user' })
  })

  it('propagates request errors', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('500'))

    await expect(submitFeedback({ message: 'hi', page: '/' })).rejects.toThrow('500')
  })
})
