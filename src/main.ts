import './ui/liquid-glass.css';
import './ui/tokens.css';
import './ui/liquid-glass.js';
import { initBackground } from './shell/background';
// lg.d.ts 為 ambient 宣告（tsconfig include 已涵蓋），不需 import

document.documentElement.setAttribute('data-lg-theme', 'dark');
document.body.setAttribute('data-mode', 'cover');
export const bg = initBackground(document.getElementById('harbor') as HTMLCanvasElement);
window.LiquidGlass.init();
