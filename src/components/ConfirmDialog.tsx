import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './ui'

export interface ConfirmOptions {
  title: string
  body: ReactNode
  confirmLabel: string
  destructive?: boolean
}

/** Accessible modal confirmation built on the native <dialog> element. */
export function ConfirmDialog({
  options,
  busy,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions | null
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (options && !dialog.open) dialog.showModal()
    if (!options && dialog.open) dialog.close()
  }, [options])

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onCancel()
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/50"
    >
      {options && (
        <div className="p-6">
          <h2 id="confirm-title" className="text-lg font-bold text-slate-900">
            {options.title}
          </h2>
          <div className="mt-3 text-slate-700">{options.body}</div>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button onClick={onCancel} disabled={busy} autoFocus>
              Cancel
            </Button>
            <Button
              variant={options.destructive ? 'danger' : 'primary'}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? 'Working...' : options.confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
