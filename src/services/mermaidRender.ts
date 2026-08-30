// src/services/mermaidRender.ts —— mermaid 源码渲染服务（M17b 共享层）
// 消费方：MermaidBlock（详情态预览）与 noteTooltip（画布备注悬停窗）。

// SVG 缓存键自增序号（模块级）：唯一即可，无需随机（Sonar S2245）
let mermaidSeq = 0

/** 渲染 mermaid 源为 SVG 字符串；加载类失败（dev 下 Vite 依赖重优化的模块图过期等
 *  基建抖动）自动重试一次，其余错误（语法等）原样抛给调用方降级 */
export async function renderMermaid(code: string, theme: 'light' | 'dark'): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const mermaid = (await import('mermaid')).default
      // 显式 strict（转义输出，无脚本/事件注入面）而非依赖库默认；主题随双主题翻转
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: theme === 'dark' ? 'dark' : 'default',
      })
      // 唯一 id：mermaid 缓存按 id 存 SVG，重复 id 会命中旧图
      mermaidSeq += 1
      const { svg } = await mermaid.render(`zen-mermaid-${mermaidSeq}`, code)
      return svg
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (attempt === 0 && /dynamically imported module|Failed to fetch/.test(message)) continue
      throw new Error(message, { cause: e })
    }
  }
}

/** 备注文本按 ```mermaid 围栏拆段：文本段（原样字符串）与图源段（围栏内容）交错。
 *  无围栏时返回单文本段（对应引擎原 innerText 行为）。围栏未闭合宽容处理：
 *  从开行起余文皆作图源（与 remark 宽容解析口径一致） */
export type NoteSegment = { kind: 'text'; content: string } | { kind: 'mermaid'; content: string }

export function splitNoteSegments(note: string): NoteSegment[] {
  const lines = note.split('\n')
  const segments: NoteSegment[] = []
  let text: string[] = []
  for (let i = 0; i < lines.length; ) {
    if (lines[i]!.trim() !== '```mermaid') {
      text.push(lines[i]!)
      i += 1
      continue
    }
    if (text.length > 0) {
      segments.push({ kind: 'text', content: text.join('\n') })
      text = []
    }
    const source: string[] = []
    i += 1
    while (i < lines.length && lines[i]!.trim() !== '```') {
      source.push(lines[i]!)
      i += 1
    }
    segments.push({ kind: 'mermaid', content: source.join('\n') })
    i += 1 // 跳过闭围栏（或越界）
  }
  if (text.length > 0) segments.push({ kind: 'text', content: text.join('\n') })
  return segments.length > 0 ? segments : [{ kind: 'text', content: '' }]
}
