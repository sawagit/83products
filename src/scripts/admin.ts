// 管理画面のブラウザ側の処理（フレームワークなし）
// - 自動保存（form[data-autosave]）
// - 公開トグル、行の追加・削除・並べ替え、タブ、サムネのアップロード
// - Ctrl+K 検索、新規作成ダイアログ、ツリーの絞り込み

type Issue = { field: string; reason: string };
type ApiResult = { ok: boolean; errors?: Issue[]; id?: number; url?: string | null; key?: string | null };

// Workers の型（worker-configuration.d.ts）と DOM の型が衝突するので、検索の起点はゆるく型付けする
type Root = { querySelector(sel: string): unknown; querySelectorAll(sel: string): Iterable<unknown> };
const $ = <T = HTMLElement>(sel: string, root: Root = document) => root.querySelector(sel) as T | null;
const $$ = <T = HTMLElement>(sel: string, root: Root = document) => [...root.querySelectorAll(sel)] as T[];

async function post(url: string, body: unknown): Promise<ApiResult> {
  try {
    const isForm = body instanceof FormData;
    const payload = isForm ? body : JSON.stringify(body);
    const res = await fetch(url, {
      method: 'POST',
      headers: isForm ? undefined : { 'content-type': 'application/json' },
      body: payload,
      credentials: 'same-origin',
      // ページを離れる途中でも送り切れるように（keepalive は 64KB まで）
      keepalive: typeof payload === 'string' && payload.length < 60000,
    });
    if (res.status === 422) return (await res.json()) as ApiResult;
    if (!res.ok) return { ok: false, errors: [{ field: '(通信)', reason: `保存できませんでした（${res.status}）。ログインが切れていたら再読み込みしてください` }] };
    return (await res.json()) as ApiResult;
  } catch {
    return { ok: false, errors: [{ field: '(通信)', reason: 'ネットワークに接続できませんでした' }] };
  }
}

let toastTimer: number | undefined;
function toast(message: string, error = false) {
  const el = $('[data-toast]');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), error ? 5000 : 1800);
}

const FIELD_LABELS: Record<string, string> = {
  title: 'タイトル',
  summary: '概要',
  body_md: '本文',
  slug: 'slug',
  public_code: '公開ID',
  released_on: 'リリース日',
  thumbnail_url: 'サムネ画像 URL',
  category_id: 'カテゴリ',
  parent_item_id: '親アイテム',
  repo_url: 'リポジトリ URL',
  preview_url: 'プレビュー URL',
  prod_url: '本番 URL',
  tech_stack: '技術スタック',
  dev_notes_md: '開発メモ',
  name: '名前',
  name_en: '英語名',
  description: '説明',
  color: '色',
  dashboard_url: 'ダッシュボード URL',
  notes: 'メモ',
  console_url: '管理画面 URL',
  url: 'URL',
  label: '表示名',
  text: '内容',
  tags: 'タグ',
};

function describe(field: string) {
  // links[2].url → 2 行目の URL
  const m = field.match(/^\w+\[(\d+)\]\.(\w+)$/);
  if (m) return `${m[1]} 行目の${FIELD_LABELS[m[2]] ?? m[2]}`;
  const n = field.match(/^\[(\d+)\](?:\.(\w+))?$/);
  if (n) return `${n[1]} 行目${n[2] ? `の${FIELD_LABELS[n[2]] ?? n[2]}` : ''}`;
  return FIELD_LABELS[field] ?? field;
}

/** エラーをフォーム内に表示し、該当する入力欄に印をつける */
function showErrors(form: HTMLElement, errors: Issue[]) {
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  const box = $('[data-errors]', form);
  if (box) box.textContent = errors.map((e) => `${describe(e.field)}：${e.reason}`).join('\n');
  for (const e of errors) {
    const m = e.field.match(/^(?:\w+)?\[(\d+)\](?:\.(\w+))?$/);
    let el: Element | null = null;
    if (m) {
      const row = $$('[data-rows] > [data-row]', form)[Number(m[1]) - 1];
      el = row && m[2] ? $(`[name="${m[2]}"]`, row) : null;
    } else {
      el = $(`[name="${e.field}"]`, form);
    }
    el?.setAttribute('aria-invalid', 'true');
  }
}

// ---------- 自動保存 ----------

function fieldValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked;
  return el.value;
}

function collect(form: HTMLFormElement): unknown {
  if (form.hasAttribute('data-list')) {
    return $$('[data-rows] > [data-row]', form).map((row) => {
      const out: Record<string, unknown> = {};
      for (const el of $$<HTMLInputElement>('[name]', row)) out[el.name] = fieldValue(el);
      return out;
    });
  }
  const single = form.dataset.single;
  if (single) return ($<HTMLInputElement>(`[name="${single}"]`, form)?.value ?? '');
  const out: Record<string, unknown> = {};
  for (const el of $$<HTMLInputElement>('[name]', form)) {
    if (el.closest('template')) continue;
    out[el.name] = fieldValue(el);
  }
  return out;
}

function statusEl(form: HTMLElement) {
  return (
    form.closest('.cat-card')?.querySelector<HTMLElement>('[data-save-status]') ??
    $('[data-save-status]', form) ??
    $('[data-save-status]')
  );
}

function setStatus(form: HTMLElement, text: string, error = false) {
  const el = statusEl(form);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', error);
}

const timers = new WeakMap<HTMLFormElement, number>();
const pending = new Set<HTMLFormElement>();

async function save(form: HTMLFormElement) {
  pending.delete(form);
  const endpoint = form.dataset.endpoint!;
  const section = form.dataset.section;
  const data = collect(form);
  setStatus(form, '保存中…');
  const res = await post(endpoint, section ? { section, data } : data);
  if (res.ok) {
    showErrors(form, []);
    setStatus(form, `保存しました ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
    afterSave(form);
  } else {
    showErrors(form, res.errors ?? []);
    setStatus(form, '保存できませんでした', true);
    toast('保存できませんでした。赤い欄を確認してください', true);
  }
}

function schedule(form: HTMLFormElement, delay = 800) {
  pending.add(form);
  setStatus(form, '未保存の変更あり');
  clearTimeout(timers.get(form));
  timers.set(form, window.setTimeout(() => save(form), delay));
}

/** 保存後に画面の他の場所（見出し・ツリー）を合わせる */
function afterSave(form: HTMLFormElement) {
  const titleInput = $<HTMLInputElement>('[data-sync-title]', form);
  if (titleInput) {
    const id = titleInput.dataset.syncTitle;
    const head = $('[data-head-title]');
    if (head) head.textContent = titleInput.value;
    const tree = $(`[data-tree-title="${id}"]`);
    if (tree) tree.textContent = titleInput.value;
    document.title = `${titleInput.value} — 83 admin`;
  }
  // アップロード画像が無いときは、外部 URL をプレビューに出す
  const thumbUrl = $<HTMLInputElement>('[data-thumb-url]', form);
  if (thumbUrl && $('[data-thumb-box]')?.dataset.uploaded !== '1') setThumb(thumbUrl.value.trim() || null);
  const status = $<HTMLSelectElement>('select[name=status]', form);
  const headStatus = $('[data-head-status]');
  if (status && headStatus) headStatus.textContent = status.selectedOptions[0]?.textContent ?? '';
}

for (const form of $$<HTMLFormElement>('form[data-autosave]')) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save(form);
  });
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    // チェックボックス・セレクト・日付・色はすぐ保存、文字入力は少し待つ
    const instant = t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && ['checkbox', 'date', 'color'].includes(t.type));
    schedule(form, instant ? 150 : 800);
  });
}

// 画面を離れる前に未保存があれば保存（keepalive で送る）
const flush = () => pending.forEach((f) => save(f));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('beforeunload', (e) => {
  if (pending.size) {
    flush();
    e.preventDefault();
  }
});

// ---------- 行の追加・削除・並べ替え ----------

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const form = target.closest<HTMLFormElement>('form[data-autosave]');
  if (!form) return;

  if (target.closest('[data-add-row]')) {
    const tpl = $<HTMLTemplateElement>('template[data-row-template]', form);
    const rows = $('[data-rows]', form);
    if (!tpl || !rows) return;
    rows.appendChild(tpl.content.cloneNode(true));
    $<HTMLInputElement>('[data-row]:last-child input:not([type=checkbox]), [data-row]:last-child select', rows)?.focus();
    return; // 空行は入力されるまで保存しない
  }
  const row = target.closest<HTMLElement>('[data-row]');
  if (!row) return;
  if (target.closest('[data-remove-row]')) {
    row.remove();
    schedule(form, 0);
  } else {
    const move = target.closest<HTMLElement>('[data-move]');
    if (!move) return;
    if (move.dataset.move === '-1' && row.previousElementSibling) row.previousElementSibling.insertAdjacentElement('beforebegin', row);
    else if (move.dataset.move === '1' && row.nextElementSibling) row.nextElementSibling.insertAdjacentElement('afterend', row);
    else return;
    schedule(form, 0);
  }
});

// ---------- 公開トグル ----------

for (const btn of $$<HTMLButtonElement>('[data-public-toggle]')) {
  btn.addEventListener('click', async () => {
    const kind = btn.dataset.publicToggle as 'item' | 'category';
    const id = btn.dataset.id!;
    const next = btn.getAttribute('aria-pressed') !== 'true';
    btn.disabled = true;
    const res = await post(`/admin/api/${kind === 'item' ? 'items' : 'categories'}/${id}/public`, { is_public: next });
    btn.disabled = false;
    if (!res.ok) {
      toast(res.errors?.[0]?.reason ?? '切り替えられませんでした', true);
      return;
    }
    btn.setAttribute('aria-pressed', String(next));
    const label = $('[data-switch-label]', btn);
    if (label) label.textContent = next ? '公開 ON' : '非公開';
    const dot = $(`[data-dot-${kind}="${id}"]`);
    dot?.classList.toggle('on', next);
    const li = dot?.closest<HTMLElement>('li');
    if (li) li.dataset.pub = next ? '1' : '0';
    dot?.closest('.row')?.classList.toggle('is-private', !next);
    toast(next ? '公開しました（公開ページに即反映）' : '非公開にしました');
  });
}

// ---------- タブ ----------

const tabs = $$<HTMLButtonElement>('[role=tab]');
function selectTab(tab: HTMLButtonElement, updateHash = true) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    const panel = document.getElementById(t.getAttribute('aria-controls')!);
    if (panel) panel.hidden = !on;
  }
  if (updateHash) history.replaceState(null, '', `#${tab.getAttribute('aria-controls')}`);
}
for (const t of tabs) t.addEventListener('click', () => selectTab(t));
if (location.hash) {
  const t = tabs.find((x) => `#${x.getAttribute('aria-controls')}` === location.hash);
  if (t) selectTab(t, false);
}

// ---------- サムネ ----------

const upload = $<HTMLInputElement>('[data-thumb-upload]');
const removeBtn = $<HTMLButtonElement>('[data-thumb-remove]');
function setThumb(url: string | null, uploaded?: boolean) {
  const box = $('[data-thumb-box]');
  if (!box) return;
  if (uploaded !== undefined) box.dataset.uploaded = uploaded ? '1' : '0';
  box.replaceChildren();
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    box.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = 'サムネなし';
    box.appendChild(span);
  }
  if (removeBtn) removeBtn.hidden = box.dataset.uploaded !== '1';
}
upload?.addEventListener('change', async () => {
  const file = upload.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const errBox = $('[data-thumb-errors]');
  if (errBox) errBox.textContent = 'アップロード中…';
  const res = await post(upload.dataset.thumbUpload + '/thumbnail', fd);
  if (errBox) errBox.textContent = res.ok ? '' : (res.errors ?? []).map((e) => e.reason).join('\n');
  if (res.ok) {
    setThumb(res.url ?? null, true);
    toast('サムネを更新しました');
  }
  upload.value = '';
});
removeBtn?.addEventListener('click', async () => {
  if (!confirm('サムネを外しますか？')) return;
  const res = await post(removeBtn.dataset.thumbRemove + '/thumbnail', { remove: true });
  if (res.ok) setThumb($<HTMLInputElement>('[data-thumb-url]')?.value.trim() || null, false);
});

// ---------- 削除 ----------

document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const item = t.closest<HTMLElement>('[data-delete-item]');
  if (item) {
    if (!confirm('このアイテムを削除しますか？リンク・開発情報・ToDo も消え、元に戻せません。')) return;
    const res = await post(`/admin/api/items/${item.dataset.deleteItem}/delete`, {});
    if (res.ok) location.href = '/admin';
    else toast(res.errors?.[0]?.reason ?? '削除できませんでした', true);
    return;
  }
  const cat = t.closest<HTMLElement>('[data-delete-category]');
  if (cat) {
    if (!confirm('このカテゴリを削除しますか？')) return;
    const res = await post(`/admin/api/categories/${cat.dataset.deleteCategory}/delete`, {});
    if (res.ok) location.reload();
    else toast(res.errors?.[0]?.reason ?? '削除できませんでした', true);
    return;
  }
  const svc = t.closest<HTMLElement>('[data-delete-service]');
  if (svc) {
    if (!confirm('このサービスを台帳から削除しますか？アイテムとの紐づけも外れます。')) return;
    const res = await post(`/admin/api/services/${svc.dataset.deleteService}/delete`, {});
    if (res.ok) location.reload();
  }
});

// ---------- 作成フォーム（カテゴリ追加など） ----------

for (const form of $$<HTMLFormElement>('form[data-create]')) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await post(form.dataset.create!, collect(form));
    if (res.ok) location.reload();
    else showErrors(form, res.errors ?? []);
  });
}

// ---------- 新規アイテム ----------

const newDialog = $<HTMLDialogElement>('[data-new-item]');
const newForm = $<HTMLFormElement>('[data-new-item-form]');
$$('[data-new-item-open]').forEach((b) =>
  b.addEventListener('click', () => {
    newDialog?.showModal();
    $<HTMLInputElement>('[name=title]', newForm!)?.focus();
  }),
);
$('[data-close]', newDialog ?? undefined)?.addEventListener('click', () => newDialog?.close());
newForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(newForm);
  const res = await post('/admin/api/items', { title: fd.get('title'), category_id: Number(fd.get('category_id')) });
  if (res.ok && res.id) location.href = `/admin/items/${res.id}`;
  else showErrors(newForm, res.errors ?? []);
});

// ---------- ツリー ----------

const tree = $('[data-tree]');
for (const b of $$<HTMLButtonElement>('[data-filter-btn]')) {
  b.addEventListener('click', () => {
    if (tree) tree.dataset.filter = b.dataset.filterBtn!;
    $$('[data-filter-btn]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
}
$('[data-tree-open]')?.addEventListener('click', () => document.body.classList.add('tree-open'));
$('[data-tree-close]')?.addEventListener('click', () => document.body.classList.remove('tree-open'));
$('[aria-current=page]', tree ?? undefined)?.scrollIntoView({ block: 'center' });

// ---------- Ctrl+K 検索 ----------

type Entry = { href: string; title: string; sub: string; is_public: boolean | null };
const entries: Entry[] = JSON.parse($('#search-data')?.textContent ?? '[]');
const palette = $<HTMLDialogElement>('[data-palette]');
const pInput = $<HTMLInputElement>('[data-palette-input]');
const pList = $('[data-palette-results]');
let selected = 0;
let shown: Entry[] = [];

function renderPalette() {
  const q = (pInput?.value ?? '').trim().toLowerCase();
  shown = entries.filter((e) => !q || `${e.title} ${e.sub}`.toLowerCase().includes(q)).slice(0, 30);
  selected = Math.min(selected, Math.max(shown.length - 1, 0));
  pList?.replaceChildren(
    ...shown.map((e, i) => {
      const li = document.createElement('li');
      li.setAttribute('aria-selected', String(i === selected));
      const a = document.createElement('a');
      a.href = e.href;
      if (e.is_public !== null) {
        const dot = document.createElement('span');
        dot.className = `dot${e.is_public ? ' on' : ''}`;
        a.appendChild(dot);
      }
      a.appendChild(document.createTextNode(e.title));
      const small = document.createElement('small');
      small.textContent = e.sub;
      a.appendChild(small);
      li.appendChild(a);
      return li;
    }),
  );
  $('[aria-selected=true]', pList ?? undefined)?.scrollIntoView({ block: 'nearest' });
}
function openPalette() {
  if (!palette || palette.open) return;
  selected = 0;
  if (pInput) pInput.value = '';
  renderPalette();
  palette.showModal();
  pInput?.focus();
}
$$('[data-palette-open]').forEach((b) => b.addEventListener('click', openPalette));
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette();
  }
});
pInput?.addEventListener('input', () => {
  selected = 0;
  renderPalette();
});
pInput?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') selected = Math.min(selected + 1, shown.length - 1);
  else if (e.key === 'ArrowUp') selected = Math.max(selected - 1, 0);
  else if (e.key === 'Enter') {
    const hit = shown[selected];
    if (hit) location.href = hit.href;
    return;
  } else return;
  e.preventDefault();
  renderPalette();
});
palette?.addEventListener('click', (e) => {
  if (e.target === palette) palette.close();
});
