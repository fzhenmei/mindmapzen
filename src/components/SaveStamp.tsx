import { useEffect, useState } from 'react'

/** 印记：保存成功（朱砂印）/已复制（墨青印），250ms 缩放定影，1.2s 后消失 */
export default function SaveStamp({ kind }: Readonly<{ kind: 'saved' | 'copied' }>) {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 1200)
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  return (
    <span
      data-testid="save-stamp"
      className={`save-stamp ${kind === 'saved' ? 'stamp-seal' : 'stamp-ink'}`}
    >
      {kind === 'saved' ? '已存' : '已复制'}
    </span>
  )
}
