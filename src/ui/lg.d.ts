export {};
declare global {
  interface Window {
    LiquidGlass: {
      init(config?: object): void;
      attach(el: Element, opts?: object): void;
      refresh(): void;
      toast(opts: { title: string; message?: string; icon?: string; duration?: number }): void;
      // init() 只在開機掃一次全頁；動態 mount 的新 section 要重新掃 .lg-stat/.lg-meter/.lg-gauge/
      // svg[data-lg-chart] 才會接上彈簧動畫，用這個 behaviors.stats(root) 重新掃描（見 router.ts）。
      behaviors: { stats(root?: Element | Document): void };
    };
  }
}
