import MindMap from 'simple-mind-map'

/** 纸墨（亮）：纸底、墨块根、墨青一级、淡墨曲线、朱砂选中环（设计值见计划 Global Constraints）。
 *  键名依据 docs/notes/engine-api.md「M4 核验」：选中态无 activeBorderColor/activeBorderWidth，
 *  真实键为各层级 hoverRectColor（hover 与选中共用，浓淡由引擎内置 CSS 区分）。 */
export const ENGINE_THEME_PAPER = {
  backgroundColor: '#F7F6F3',
  lineColor: '#8B867A',
  lineWidth: 1.5,
  lineStyle: 'curve',
  rootLineKeepSameInCurve: true,
  paddingX: 14,
  paddingY: 6,
  root: {
    shape: 'rectangle',
    fillColor: '#26241F',
    color: '#F7F6F3',
    fontSize: 16,
    fontWeight: 'bold',
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 6,
    hoverRectColor: '#B5453C',
    hoverRectRadius: 6,
  },
  second: {
    shape: 'rectangle',
    fillColor: '#E8EFEA',
    color: '#26241F',
    fontSize: 14,
    fontWeight: '500',
    borderColor: '#385B57',
    borderWidth: 1,
    borderRadius: 6,
    hoverRectColor: '#B5453C',
    hoverRectRadius: 6,
  },
  node: {
    shape: 'rectangle',
    fillColor: '#FCFBF9',
    color: '#26241F',
    fontSize: 14,
    fontWeight: '500',
    borderColor: '#E4E1DA',
    borderWidth: 1,
    borderRadius: 6,
    hoverRectColor: '#B5453C',
    hoverRectRadius: 6,
  },
}

/** 夜墨（暗）：暖炭底、月白根（反墨）、青瓷一级、夜连线、砂亮选中环 */
export const ENGINE_THEME_NIGHT: typeof ENGINE_THEME_PAPER = {
  ...ENGINE_THEME_PAPER,
  backgroundColor: '#191A18',
  lineColor: '#4A4C46',
  root: { ...ENGINE_THEME_PAPER.root, fillColor: '#D9D7D0', color: '#191A18', hoverRectColor: '#C96A5F' },
  second: {
    ...ENGINE_THEME_PAPER.second,
    fillColor: '#2A3B37',
    color: '#D9D7D0',
    borderColor: '#7FA8A0',
    hoverRectColor: '#C96A5F',
  },
  node: {
    ...ENGINE_THEME_PAPER.node,
    fillColor: '#202221',
    color: '#D9D7D0',
    borderColor: '#343633',
    hoverRectColor: '#C96A5F',
  },
}

export function engineThemeName(resolved: 'light' | 'dark'): 'zen-paper' | 'zen-night' {
  return resolved === 'dark' ? 'zen-night' : 'zen-paper'
}

let registered = false

/** 注册两个命名主题（幂等；defineTheme 为纯静态注册，同名重复注册会静默无效而非抛错，
 *  故幂等语义由本守卫保证——见 docs/notes/engine-api.md「M4 核验」(11)） */
export function registerZenThemes(): void {
  if (registered) return
  MindMap.defineTheme('zen-paper', { ...ENGINE_THEME_PAPER })
  MindMap.defineTheme('zen-night', { ...ENGINE_THEME_NIGHT })
  registered = true
}
