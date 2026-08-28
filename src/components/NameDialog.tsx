import { useState } from 'react'

interface Props {
  title: string
  initial?: string
  confirmText: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export default function NameDialog({ title, initial = '', confirmText, onConfirm, onCancel }: Readonly<Props>) {
  const [value, setValue] = useState(initial)
  return (
    <div className="dialog-mask" role="dialog" aria-label={title}>
      <div className="dialog">
        <h3>{title}</h3>
        <input
          data-testid="input-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        />
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button type="button" data-testid="btn-confirm" onClick={() => onConfirm(value.trim())}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
