/* schema → DOM 渲染器：instant（change/input 即 setSetting + flash）與 explicit（draft + savebar +
   儲存/捨棄）兩種欄位語意。欄位 markup 逐字對照 docs/preview/preview-settings.html 的對應段落
   （viewFrontend/viewCarbon/viewPending 與 bindPanel 的 instant/explicit 綁定）。 */
import { getSetting, setSetting } from './storage';
import type { ActionResult, SettingField, SettingGroup, SettingsCtx, SettingsSection } from './schema';

export function tail4(key: string): string {
  return key.length >= 4 ? '••••' + key.slice(-4) : '••••';
}

const esc = (s: string): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/* group 渲染：
   - custom 有值 → 建 .gcard 容器 + ghead 後把 body 元素交給 custom(el, ctx)
   - fields → 逐欄位出 .frow；instant 欄位變更即 setSetting + flash；
     explicit 欄位變更寫入 draft、浮出 savebar，儲存時整批 setSetting + saved 綠勾，
     捨棄時重渲染整個 group（丟 draft）
   - pending group → .gcard 加 .pend、全欄位 disabled */
export function renderSection(el: HTMLElement, section: SettingsSection, ctx: SettingsCtx): void {
  el.innerHTML = '';
  section.groups.forEach((g) => el.appendChild(renderGroup(g, ctx)));
}

function renderGroup(g: SettingGroup, ctx: SettingsCtx): HTMLElement {
  const card = document.createElement('div');
  card.className = 'gcard' + (g.pending ? ' pend' : '');
  const tone = g.badgeTone === 'live' ? ' live' : g.badgeTone === 'blue' ? ' blue' : g.badgeTone === 'wait' ? ' wait' : '';
  card.innerHTML =
    '<div class="ghead"><h3>' + esc(g.title) + '</h3>' +
    (g.badge ? '<span class="gbadge' + tone + '">' + esc(g.badge) + '</span>' : '') +
    '<span class="sp"></span></div>';
  const body = document.createElement('div');
  card.appendChild(body);
  if (g.custom) {
    g.custom(body, ctx);
    return card;
  }
  const draft = new Map<string, unknown>();
  body.innerHTML = (g.fields ?? []).map((f, i) => fieldHtml(f, g, i)).join('');
  if (g.saveMode === 'explicit') {
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="savebar"><span>未儲存變更</span><span class="sp"></span>' +
        '<button class="mini act-discard">捨棄</button><button class="mini acc act-save">儲存</button></div>' +
        '<div class="saved">已儲存</div>',
    );
  }
  bindGroup(body, g, draft, ctx, card);
  return card;
}

/* ---------- 欄位層級 ---------- */

function fieldDisabled(f: SettingField, g: SettingGroup): boolean {
  if (f.kind === 'note') return false;
  return !!f.disabled || !!g.pending;
}

function frow(f: { label: string; help?: string }, ctl: string): string {
  const help = f.help ? '<span class="help">' + esc(f.help) + '</span>' : '';
  return '<div class="frow"><div class="flabel">' + esc(f.label) + help + '</div><div class="fctl">' + ctl + '</div></div>';
}

function textHtml(f: Extract<SettingField, { kind: 'text' }>, g: SettingGroup): string {
  const disabled = fieldDisabled(f, g);
  const valueAttr = disabled ? '' : ' value="' + esc(String(getSetting(f.key, ''))) + '"';
  return frow(
    f,
    '<input class="tin" type="text" data-key="' + esc(f.key) + '" placeholder="' + esc(f.placeholder ?? '') + '"' +
      valueAttr + (disabled ? ' disabled' : '') + '>',
  );
}

function passwordHtml(f: Extract<SettingField, { kind: 'password' }>, g: SettingGroup): string {
  const disabled = fieldDisabled(f, g);
  if (disabled) {
    return frow(f, '<input class="tin" type="password" placeholder="••••••••" disabled>');
  }
  const cur = getSetting<string>(f.key, '');
  if (cur) {
    return frow(
      f,
      '<span class="masked">' + tail4(cur) + '</span>' +
        '<button type="button" class="mini act-change" data-key="' + esc(f.key) + '">更換</button>' +
        '<button type="button" class="mini danger act-clear" data-key="' + esc(f.key) + '">清除</button>',
    );
  }
  return frow(
    f,
    '<input class="tin" type="password" data-key="' + esc(f.key) + '" placeholder="••••••••">' +
      '<button type="button" class="eyebtn act-eye" data-key="' + esc(f.key) + '">顯示</button>',
  );
}

function selectHtml(f: Extract<SettingField, { kind: 'select' }>, g: SettingGroup): string {
  const opts = f.options();
  const disabled = fieldDisabled(f, g) || opts.length === 0;
  const cur = getSetting<string>(f.key, opts[0]?.value ?? '');
  const optHtml = opts
    .map((o) => '<option value="' + esc(o.value) + '"' + (o.value === cur ? ' selected' : '') + '>' + esc(o.label) + '</option>')
    .join('');
  const guide = opts.length === 0 ? '<span class="guide">尚無可用選項</span>' : '';
  return frow(f, '<select class="sel" data-key="' + esc(f.key) + '"' + (disabled ? ' disabled' : '') + '>' + optHtml + '</select>' + guide);
}

function toggleHtml(f: Extract<SettingField, { kind: 'toggle' }>, g: SettingGroup): string {
  const disabled = fieldDisabled(f, g);
  const checked = getSetting<boolean>(f.key, f.defaultOn ?? false);
  return frow(
    f,
    '<label class="tgl' + (disabled ? ' dis' : '') + '"><input type="checkbox" data-key="' + esc(f.key) + '"' +
      (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="tr"></span><span class="th"></span></label>' +
      '<span class="flash" data-flash-for="' + esc(f.key) + '">✓ 已生效</span>',
  );
}

function numberHtml(f: Extract<SettingField, { kind: 'number' }>, g: SettingGroup): string {
  const disabled = fieldDisabled(f, g);
  const cur = disabled ? '' : String(getSetting<number>(f.key, f.min ?? 0));
  const attrs = [f.min != null ? 'min="' + f.min + '"' : '', f.max != null ? 'max="' + f.max + '"' : '', f.step != null ? 'step="' + f.step + '"' : '']
    .filter(Boolean)
    .join(' ');
  return frow(
    f,
    '<input class="tin num" type="number" data-key="' + esc(f.key) + '"' + (cur ? ' value="' + esc(cur) + '"' : '') +
      (attrs ? ' ' + attrs : '') + (disabled ? ' disabled' : '') + '>',
  );
}

function sliderHtml(f: Extract<SettingField, { kind: 'slider' }>, g: SettingGroup): string {
  const disabled = fieldDisabled(f, g);
  const cur = getSetting<number>(f.key, f.min);
  const step = f.step ?? 1;
  return frow(
    f,
    '<input class="rng" type="range" data-key="' + esc(f.key) + '" min="' + f.min + '" max="' + f.max + '" step="' + step +
      '" value="' + cur + '"' + (disabled ? ' disabled' : '') + '>',
  );
}

function actionHtml(f: Extract<SettingField, { kind: 'action' }>, g: SettingGroup, idx: number): string {
  const disabled = !!f.disabled || !!g.pending;
  const ctl =
    '<button type="button" class="mini acc act-run" data-idx="' + idx + '"' + (disabled ? ' disabled' : '') + '>' + esc(f.button) + '</button>' +
    '<div class="tstate" data-idx="' + idx + '"></div>';
  return frow(f, ctl);
}

function noteHtml(f: Extract<SettingField, { kind: 'note' }>): string {
  return '<div class="gnote">' + esc(f.text) + '</div>';
}

function fieldHtml(f: SettingField, g: SettingGroup, idx: number): string {
  switch (f.kind) {
    case 'text':
      return textHtml(f, g);
    case 'password':
      return passwordHtml(f, g);
    case 'select':
      return selectHtml(f, g);
    case 'toggle':
      return toggleHtml(f, g);
    case 'number':
      return numberHtml(f, g);
    case 'slider':
      return sliderHtml(f, g);
    case 'action':
      return actionHtml(f, g, idx);
    case 'note':
      return noteHtml(f);
  }
}

/* ---------- 事件綁定 ---------- */

function readValue(el: HTMLInputElement | HTMLSelectElement): unknown {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.type === 'range') return Number(el.value);
  }
  return el.value;
}

function bindGroup(body: HTMLElement, g: SettingGroup, draft: Map<string, unknown>, ctx: SettingsCtx, card: HTMLElement): void {
  const isInstant = g.saveMode === 'instant';

  function markDirty(): void {
    body.querySelector('.savebar')?.classList.add('show');
    body.querySelector('.saved')?.classList.remove('show');
  }

  body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((el) => {
    const key = el.getAttribute('data-key');
    if (!key) return;
    const evName = el.tagName === 'SELECT' || (el instanceof HTMLInputElement && el.type === 'checkbox') ? 'change' : 'input';
    el.addEventListener(evName, () => {
      const v = readValue(el);
      if (isInstant) {
        setSetting(key, v);
        const flash = el.closest('.frow')?.querySelector('.flash');
        if (flash) {
          flash.classList.add('show');
          setTimeout(() => flash.classList.remove('show'), 1400);
        }
      } else {
        draft.set(key, v);
        markDirty();
      }
    });
  });

  body.querySelectorAll<HTMLButtonElement>('.act-eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      const input = body.querySelector<HTMLInputElement>('input[data-key="' + key + '"]');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '顯示' : '隱藏';
    });
  });

  body.querySelectorAll<HTMLButtonElement>('.act-change').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      if (!key) return;
      setSetting(key, '');
      card.replaceWith(renderGroup(g, ctx));
    });
  });

  body.querySelectorAll<HTMLButtonElement>('.act-clear').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      if (!key) return;
      if (confirm('清除已儲存的設定？')) {
        setSetting(key, '');
        card.replaceWith(renderGroup(g, ctx));
      }
    });
  });

  body.querySelectorAll<HTMLButtonElement>('.act-run').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const idx = Number(btn.getAttribute('data-idx'));
      const field = (g.fields ?? [])[idx];
      if (!field || field.kind !== 'action') return;
      const state = body.querySelector<HTMLElement>('.tstate[data-idx="' + idx + '"]');
      btn.disabled = true;
      if (state) {
        state.className = 'tstate run';
        state.innerHTML = '<span class="spin"></span>執行中…';
      }
      field.run(ctx).then((res: ActionResult) => {
        if (state) {
          state.className = 'tstate ' + (res.ok ? 'ok' : 'err');
          state.textContent = (res.ok ? '✓ ' : '✗ ') + res.message;
        }
        btn.disabled = !!field.disabled;
      });
    });
  });

  if (g.saveMode === 'explicit') {
    body.querySelector('.act-save')?.addEventListener('click', () => {
      if (draft.size === 0) return;
      draft.forEach((v, k) => setSetting(k, v));
      draft.clear();
      const next = renderGroup(g, ctx);
      card.replaceWith(next);
      next.querySelector('.saved')?.classList.add('show');
    });
    body.querySelector('.act-discard')?.addEventListener('click', () => {
      draft.clear();
      card.replaceWith(renderGroup(g, ctx));
    });
  }
}
