'use client'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="cyber-overlay" onClick={onCancel}>
      <div className="cyber-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button className="cyber-btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={destructive ? 'cyber-btn-danger' : 'cyber-btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
