// src/services/basketSync.ts —— 跨窗同步（spec §5.5）：捕获小窗写盘成功后 emit，
// 主窗按状态决策（reload/notify/ignore）。纯函数在 M2 Task 9 扩充
export const BASKET_UPDATED_EVENT = 'basket-updated'
