import MindMap from 'simple-mind-map'

/** 晨松（亮）：白墙底、石墨实心根（亮字）、青松浅底一级、雾灰曲线、青松选中环（spec §2）。
 *  键名依据 docs/notes/engine-api.md「M4 核验」：选中态无 activeBorderColor/activeBorderWidth，
 *  真实键为各层级 hoverRectColor（hover 与选中共用，浓淡由引擎内置 CSS 区分）；
 *  环宽亦为引擎内置（核验 (10) 的 stroke 调用仅取色），主题只控色与圆角。 */
export const ENGINE_THEME_PAPER = {
  backgroundColor: '#F7F8F7',
  lineColor: '#64707A',
  lineWidth: 1.5,
  // 关联线（M5b Task 3 核验）：引擎无 .smm-associative-line 类，线色经主题根键 associativeLineColor
  // 由 SVG.js 属性着色（CSS 直染会波及透明点击线）；取值与 @theme --color-line 同源（M12b Task 1 键）
  associativeLineColor: '#64707A',
  associativeLineWidth: 1.5,
  // 节点插图缩略上限（M19 验收：大图会把导图搞得没法看）——96px 缩略 + 悬停浮层看
  // 原图（imgTooltip）；引擎 default 200×100 偏大，主题显式收敛
  imgMaxWidth: 96,
  imgMaxHeight: 96,
  lineStyle: 'curve',
  rootLineKeepSameInCurve: true,
  paddingX: 14,
  paddingY: 6,
  root: {
    shape: 'rectangle',
    fillColor: '#1F2328',
    color: '#F7F7F7',
    fontSize: 16,
    fontWeight: 'bold',
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 6,
    hoverRectColor: '#1D7A6B',
    hoverRectRadius: 6,
  },
  second: {
    shape: 'rectangle',
    fillColor: '#E3F2EE',
    color: '#1F2328',
    fontSize: 14,
    fontWeight: '500',
    borderColor: '#1D7A6B',
    borderWidth: 1,
    borderRadius: 6,
    hoverRectColor: '#1D7A6B',
    hoverRectRadius: 6,
  },
  node: {
    shape: 'rectangle',
    fillColor: '#FFFFFF',
    color: '#1F2328',
    fontSize: 14,
    fontWeight: '500',
    borderColor: '#E4E7E6',
    borderWidth: 1,
    borderRadius: 6,
    hoverRectColor: '#1D7A6B',
    hoverRectRadius: 6,
  },
}

/** 夜航（暗）：夜航底、月白根（反转）、青松深底一级、夜雾连线、青松亮选中环 */
export const ENGINE_THEME_NIGHT: typeof ENGINE_THEME_PAPER = {
  ...ENGINE_THEME_PAPER,
  backgroundColor: '#14181A',
  lineColor: '#8B9599',
  associativeLineColor: '#8B9599',
  root: { ...ENGINE_THEME_PAPER.root, fillColor: '#D6DBDA', color: '#14181A', hoverRectColor: '#4CBFA8' },
  second: {
    ...ENGINE_THEME_PAPER.second,
    fillColor: '#1D3B36',
    color: '#D6DBDA',
    borderColor: '#4CBFA8',
    hoverRectColor: '#4CBFA8',
  },
  node: {
    ...ENGINE_THEME_PAPER.node,
    fillColor: '#1B2022',
    color: '#D6DBDA',
    borderColor: '#2A3033',
    hoverRectColor: '#4CBFA8',
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
