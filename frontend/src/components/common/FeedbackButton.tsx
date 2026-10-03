import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { submitFeedback } from '../../services/feedback.service'

type Status = 'idle' | 'sending' | 'sent' | 'error'

const MAX_LENGTH = 2000

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const titleId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    setMessage('')
    setStatus('idle')
    triggerRef.current?.focus()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) return

    setStatus('sending')
    try {
      await submitFeedback({ message: trimmed, page: window.location.pathname })
      setStatus('sent')
      setMessage('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Give feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
            }}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              Send feedback
            </h2>

            {status === 'sent' ? (
              <div className="mt-4 space-y-4">
                <p role="status" className="text-sm text-slate-700">
                  Thanks — your feedback was sent.
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <label className="block text-sm text-slate-700">
                  What's working, what isn't?
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={MAX_LENGTH}
                    rows={5}
                    className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  />
                </label>

                {status === 'error' && (
                  <p role="alert" className="text-sm text-red-600">
                    Couldn't send feedback. Please try again.
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!message.trim() || status === 'sending'}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {status === 'sending' ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
