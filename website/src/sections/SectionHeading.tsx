/** 分节标题:eyebrow 用 Markdown 语法记号(## / [[ ]])——结构装置编码产品
 *  自身的世界(节标即 md 源码),非装饰性编号。 */
export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  readonly eyebrow: string
  readonly title: string
  readonly description?: string
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="font-mono text-sm text-primary">{eyebrow}</div>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance">{title}</h2>
      {description && <p className="mt-3 text-muted-foreground">{description}</p>}
    </div>
  )
}
