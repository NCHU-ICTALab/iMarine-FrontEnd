/* 共用頁面骨架元件 — Task 5。
   screenHeader / statRow / srcChip 三個純模板字串函式，供 Task 6-12 各 screen 的 mount() 組裝畫面。
   markup 對齊基準檔 docs/preview/preview-src-v3.html 的 .eyebrow/.trow/.src/.stats4 結構
   （含 lg lg-stat + data-lg-value/-spark 屬性驅動彈簧動畫，由 liquid-glass.js 掃描 [data-lg] 後接手）。
   本檔不做 placeholderCard：本計畫會把六個功能頁全部做完，不會有模組維持佔位狀態，
   該 helper 不會有任何呼叫端（YAGNI，見 task-5-brief 的範疇縮減）。 */

import type { Source } from '../data/types';

export interface ScreenHeaderOptions {
  eyebrow: string; // 例：'航港局視角 · MODULE 01'
  color: string; // 模組色，餵給 eyebrow 圓點的 --mc
  title: string;
  badges?: string[]; // 技術徽章 chips（渲染成 .lg-chip）
  source: Source;
  sourceLabel?: string; // live→綠 chip，mock→灰；未給則用 srcChip() 的預設文字
  actionsHtml?: string; // 標題列右側自訂區（.spacer 之後）
}

export interface StatItem {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  delta?: string; // 呼叫端決定文字/正負號，原樣塞進 .lg-stat__delta（不代猜漲跌樣式）
  spark?: number[]; // 折線資料，join(',') 成 data-lg-spark
  valueClass?: string; // 額外掛在 .lg-stat__value 上的 class（如 goldc 色彩）
}

/** 資料來源 chip：mock → 灰底 .src，live → 綠底 .src.live，內含空的 <i> 圓點。 */
export function srcChip(source: Source, label?: string): string {
  const cls = source === 'live' ? 'src live' : 'src';
  const text = label ?? (source === 'live' ? 'LIVE' : 'MOCK 資料');
  return `<span class="${cls}"><i></i>${text}</span>`;
}

/**
 * 頁首：<header class="anim" style="--d:0s"> 內含
 *   .eyebrow（圓點 --mc + 標籤）與
 *   .trow（<h1> + 技術徽章 chips + 來源 chip + .spacer + 自訂右側動作）。
 * --d:0s 對齊基準檔每一頁 header 的進場延遲（一律最先進場，無需參數化）。
 */
export function screenHeader(o: ScreenHeaderOptions): string {
  const badges = (o.badges ?? []).map((b) => `<span class="lg-chip">${b}</span>`).join('');
  const actions = o.actionsHtml ?? '';
  return (
    '<header class="anim" style="--d:0s">' +
    `<div class="eyebrow"><span class="dot" style="--mc:${o.color}"></span><span class="lbl">${o.eyebrow}</span></div>` +
    '<div class="trow">' +
    `<h1>${o.title}</h1>${badges}${srcChip(o.source, o.sourceLabel)}` +
    `<span class="spacer"></span>${actions}` +
    '</div>' +
    '</header>'
  );
}

function statCard(item: StatItem): string {
  const valueClass = item.valueClass ? ` ${item.valueClass}` : '';
  const prefixAttr = item.prefix ? ` data-lg-prefix="${item.prefix}"` : '';
  const decimalsAttr = item.decimals !== undefined ? ` data-lg-decimals="${item.decimals}"` : '';
  const suffixAttr = item.suffix ? ` data-lg-suffix="${item.suffix}"` : '';
  const delta = item.delta ? `<span class="lg-stat__delta">${item.delta}</span>` : '';
  const spark = item.spark && item.spark.length
    ? `<svg class="lg-stat__spark" data-lg-spark="${item.spark.join(',')}"></svg>`
    : '';
  return (
    '<div class="lg lg-stat" data-lg>' +
    `<span class="lg-stat__label">${item.label}</span>` +
    `<div class="lg-stat__row"><span class="lg-stat__value${valueClass}" data-lg-value="${item.value}"${prefixAttr}${decimalsAttr}${suffixAttr}></span>${delta}</div>` +
    spark +
    '</div>'
  );
}

/** 統計列：.stats4 格線包 N 張 .lg.lg-stat 卡；數值/spark 由 data-lg-* 屬性驅動，liquid-glass.js 接手動畫。 */
export function statRow(items: StatItem[]): string {
  return `<div class="stats4">${items.map(statCard).join('')}</div>`;
}
