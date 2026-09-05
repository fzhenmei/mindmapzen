import type { LayoutKind } from '../types/files'

export type { LayoutKind }

/** 语义布局 → 引擎布局名（simple-mind-map `CONSTANTS.LAYOUT`，小驼峰，见 docs/notes/engine-api.md「M3 核验」(5)）。
 *  未知名引擎会静默回退右向布局，故这里显式收敛非法值。 */
export function layoutToEngine(layout: LayoutKind): string {
  switch (layout) {
    case 'logic':
      return 'mindMap' // CONSTANTS.LAYOUT.MIND_MAP：根居中、左右发散
    case 'org':
      return 'organizationStructure' // CONSTANTS.LAYOUT.ORGANIZATION_STRUCTURE：向下组织结构图
    case 'timeline':
      return 'timeline' // CONSTANTS.LAYOUT.TIMELINE：根在左，一级子节点沿水平主轴向右排开，二级挂下方
    case 'fishbone':
      return 'fishbone' // CONSTANTS.LAYOUT.FISHBONE：根在左，脊线向右，一级子节点上下分叉成鱼刺
    case 'mindmap':
    default:
      return 'logicalStructure' // CONSTANTS.LAYOUT.LOGICAL_STRUCTURE：右向思维导图
  }
}
