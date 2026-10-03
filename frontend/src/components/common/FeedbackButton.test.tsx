import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitFeedback } from '../../services/feedback.service'
import { FeedbackButton } from './FeedbackButton'

vi.mock('../../services/feedback.service', () => ({
  submitFeedback: vi.fn(),
}))

const mockSubmit = vi.mocked(submitFeedback)

function openDialog() {
  const user = userEvent.setup()
  render(<FeedbackButton />)
  return user.click(screen.getByRole('button', { name: 'Give feedback' })).then(() => user)
}

describe('FeedbackButton', () => {
  beforeEach(() => {
    mockSubmit.mockReset()
  })

  it('renders the trigger with the dialog closed', () => {
    render(<FeedbackButton />)
    expect(screen.getByRole('button', { name: 'Give feedback' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a dialog and focuses the textarea', async () => {
    await openDialog()
    expect(screen.getByRole('dialog', { name: 'Send feedback' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('disables Send until a non-blank message is entered', async () => {
    const user = await openDialog()
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()

    await user.type(screen.getByRole('textbox'), '   ')
    expect(send).toBeDisabled()

    await user.type(screen.getByRole('textbox'), 'hello')
    expect(send).toBeEnabled()
  })

  it('submits the trimmed message with the current page and shows a thank-you', async () => {
    mockSubmit.mockResolvedValue()
    const user = await openDialog()

    await user.type(screen.getByRole('textbox'), '  Queue view is slow  ')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(mockSubmit).toHaveBeenCalledWith({
      message: 'Queue view is slow',
      page: window.location.pathname,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('your feedback was sent')
  })

  it('shows an error and keeps the message when submission fails', async () => {
    mockSubmit.mockRejectedValue(new Error('network'))
    const user = await openDialog()

    await user.type(screen.getByRole('textbox'), 'Broken')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't send feedback")
    expect(screen.getByRole('textbox')).toHaveValue('Broken')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('shows a sending state and blocks double submits', async () => {
    let resolve!: () => void
    mockSubmit.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const user = await openDialog()

    await user.type(screen.getByRole('textbox'), 'Hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    const sending = screen.getByRole('button', { name: 'Sending…' })
    expect(sending).toBeDisabled()
    await user.click(sending)
    expect(mockSubmit).toHaveBeenCalledTimes(1)

    resolve()
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it.each([
    ['Cancel', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
  ])('closes on %s, clears the draft and returns focus to the trigger', async (_, action) => {
    const user = await openDialog()
    await user.type(screen.getByRole('textbox'), 'draft')

    await action(user)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Give feedback' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Give feedback' }))
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
