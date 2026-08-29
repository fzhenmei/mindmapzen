import ZenDialog from './ZenDialog'

interface Props {
  mapName: string
  onChoice: (c: 'save' | 'discard' | 'cancel') => void
}

/** 关闭守卫三态对话框：Esc/✕/遮罩点击与「取消」按钮同义 → onChoice('cancel') */
export default function CloseGuardDialog({ mapName, onChoice }: Readonly<Props>) {
  return (
    <ZenDialog
      testid="closeguard-dialog"
      title={`「${mapName}」有未保存的修改`}
      onClose={() => onChoice('cancel')}
      actions={
        <>
          <button type="button" data-testid="closeguard-cancel" onClick={() => onChoice('cancel')}>
            取消
          </button>
          <button type="button" data-testid="closeguard-discard" onClick={() => onChoice('discard')}>
            放弃修改
          </button>
          <button type="button" data-testid="closeguard-save" onClick={() => onChoice('save')}>
            保存并关闭
          </button>
        </>
      }
    />
  )
}
