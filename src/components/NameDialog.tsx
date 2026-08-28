import { useState } from 'react'
import ZenDialog from './ZenDialog'

interface Props {
  title: string
  initial?: string
  confirmText: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

/** 命名对话框：ZenDialog 外壳，Esc（原生 cancel）→ onCancel */
export default function NameDialog({ title, initial = '', confirmText, onConfirm, onCancel }: Readonly<Props>) {
  const [value, setValue] = useState(initial)
  return (
    <ZenDialog
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button type="button" data-testid="btn-confirm" onClick={() => onConfirm(value.trim())}>
            {confirmText}
          </button>
        </>
      }
    >
      <input
        data-testid="input-name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
    </ZenDialog>
  )
}
