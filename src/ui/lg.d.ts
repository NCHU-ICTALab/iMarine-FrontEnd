export {};
declare global {
  interface Window {
    LiquidGlass: {
      init(config?: object): void;
      attach(el: Element, opts?: object): void;
      refresh(): void;
      toast(opts: { title: string; message?: string; icon?: string; duration?: number }): void;
    };
  }
}
