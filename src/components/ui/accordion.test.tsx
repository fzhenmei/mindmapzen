import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion'

// Accordion（2026-09 设置窗手风琴批）：Radix 单展开语义守卫——收起项 Content 不挂载
// （消费方测试/e2e 依赖"先点 trigger 展开才见内部控件"的口径）；trigger 带 chevron
// 与 data-state，Content 动画类来自 theme.css @theme（此处只断类名不跑动画）。
describe('Accordion', () => {
  test('single collapsible：默认全收起，点 trigger 展开，再点收起', () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="a">
          <AccordionTrigger>分组甲</AccordionTrigger>
          <AccordionContent>甲内容</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>分组乙</AccordionTrigger>
          <AccordionContent>乙内容</AccordionContent>
        </AccordionItem>
      </Accordion>,
    )
    expect(screen.queryByText('甲内容')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /分组甲/ }))
    expect(screen.getByText('甲内容')).toBeInTheDocument()
    expect((screen.getByRole('button', { name: /分组甲/ }) as HTMLElement).dataset.state).toBe('open')
    fireEvent.click(screen.getByRole('button', { name: /分组甲/ }))
    expect(screen.queryByText('甲内容')).not.toBeInTheDocument()
  })

  test('single 展开互斥：开乙则甲收起；trigger 皮肤含官方类', () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="a">
          <AccordionTrigger>分组甲</AccordionTrigger>
          <AccordionContent>甲内容</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>分组乙</AccordionTrigger>
          <AccordionContent>乙内容</AccordionContent>
        </AccordionItem>
      </Accordion>,
    )
    fireEvent.click(screen.getByRole('button', { name: /分组甲/ }))
    fireEvent.click(screen.getByRole('button', { name: /分组乙/ }))
    expect(screen.queryByText('甲内容')).not.toBeInTheDocument()
    expect(screen.getByText('乙内容')).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: /分组乙/ })
    expect(trigger.querySelector('svg')).not.toBeNull() // chevron
    expect(trigger.className).toContain('text-sm')
  })
})
