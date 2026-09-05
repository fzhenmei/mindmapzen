import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn 约定的类名工具:clsx 负责合并(数组/条件/假值滤除),tailwind-merge
 *  负责冲突消解(同组工具类后者覆盖前者)——调用方 className 恒压过组件内置默认。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
