/* 派工結論句標記解析 — {{stop:..}} 玫紅強調、{{add:..}} 綠強調（spec §4）。
   純函式、零 DOM 依賴，仿 policy 的 {{c:..}} 手法拆出可測模組。 */
export function parseConclusion(s: string): string {
  return s
    .replace(/\{\{stop:([^}]*)\}\}/g, '<em>$1</em>')
    .replace(/\{\{add:([^}]*)\}\}/g, '<u>$1</u>');
}
