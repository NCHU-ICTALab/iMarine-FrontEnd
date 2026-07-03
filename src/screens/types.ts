export type Mode = 'cover' | 'ov' | 'doc' | 'full';

export interface ToastOpts {
  title: string;
  message?: string;
  icon?: string;
  duration?: number;
}

export interface ScreenCtx {
  data: import('../data/types').DataExchange;
  ui: { toast(o: ToastOpts): void; refresh(): void };
  setMode(m: Mode): void; // hero 兩段式切換用（main.ts 接 applyMode）
  background: { setTwinOffset(h: number): void; repaint(): void }; // = Task 1 的 Background
}

export interface Screen {
  mount(el: HTMLElement, ctx: ScreenCtx): void | Promise<void>; // 每 screen 只呼叫一次（首次進入）
  show?(): void; // 每次切入時呼叫（含首次，於 mount 之後）
  hide?(): void; // 切出時呼叫；DOM 保留（spec 第 9 節：twin iframe 離開時不銷毀）
}
