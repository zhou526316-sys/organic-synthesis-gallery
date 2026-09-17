import { escapeHtml, statusLabel, store, type Language, type PaperUserState } from './shared';

const ELEMENT_NAME = 'gallery-user-shell';
const PATCH_FLAG = Symbol.for('organic-gallery.user-center-management');

type ShellInstance = HTMLElement & {
  render?: () => void;
  action?: (action: string) => Promise<void> | void;
  paperList?: (mode: 'saved' | 'notes') => string;
};

function languageOf(shell: HTMLElement): Language {
  return shell.dataset.language === 'en' ? 'en' : 'zh';
}

function tr(language: Language, zh: string, en: string): string {
  return language === 'zh' ? zh : en;
}

function decodePaperId(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function paperAction(name: string, paperId: string): string {
  return `${name}:${encodeURIComponent(paperId)}`;
}

function labelSummary(state: PaperUserState, language: Language): string[] {
  const labels: string[] = [];
  for (const id of state.collections || []) {
    const collection = store.state.collections.find(item => item.id === id);
    if (collection) labels.push(`${tr(language, '收藏夹', 'Folder')}: ${collection.name}`);
  }
  for (const id of state.quickTerms || []) {
    const term = store.state.quickTerms.find(item => item.id === id);
    if (term) labels.push(term.label);
  }
  for (const tag of state.tags || []) labels.push(tag);
  return labels;
}

function renderPaperList(shell: ShellInstance, mode: 'saved' | 'notes'): string {
  const language = languageOf(shell);
  const entries = Object.entries(store.state.papers)
    .filter(([, state]) => mode === 'saved' ? state.favorite : Boolean(state.note))
    .sort((a, b) => (b[1].updatedAt || b[1].noteUpdatedAt || b[1].lastOpenedAt || 0) - (a[1].updatedAt || a[1].noteUpdatedAt || a[1].lastOpenedAt || 0));

  if (!entries.length) {
    return `<div class='empty'>${mode === 'saved' ? tr(language, '暂无收藏。', 'No saved papers yet.') : tr(language, '暂无私人备注。', 'No private notes yet.')}</div>`;
  }

  return entries.map(([id, state]) => {
    const meta = store.metadata(id);
    const status = state.statusId ? store.status(state.statusId) : undefined;
    const labels = labelSummary(state, language);
    const title = meta?.title || id;
    const encoded = encodeURIComponent(id);
    const notePreview = state.note ? `${escapeHtml(state.note.slice(0, 180))}${state.note.length > 180 ? '…' : ''}` : '';

    return `<div class='item' data-managed-paper='${escapeHtml(encoded)}'>
      ${meta?.href ? `<a href='${escapeHtml(meta.href)}' target='_blank' rel='noopener noreferrer'>${escapeHtml(title)}</a>` : `<strong>${escapeHtml(title)}</strong>`}
      <small>${escapeHtml(meta?.journal || '')}${status ? ` · ${escapeHtml(statusLabel(status, language))}` : ''}</small>
      ${labels.length ? `<div class='row'>${labels.map(label => `<span class='help'>${escapeHtml(label)}</span>`).join('')}</div>` : ''}
      ${mode === 'notes' && notePreview ? `<div>${notePreview}</div>` : ''}
      <div class='row' style='margin-top:5px'>
        ${mode === 'saved' ? `<button class='link danger' type='button' data-action='${escapeHtml(paperAction('user-unfavorite', id))}'>${tr(language, '取消收藏', 'Unsave')}</button>` : ''}
        <button class='link' type='button' data-action='${escapeHtml(paperAction('user-status', id))}'>${status ? tr(language, '修改阅读状态', 'Change status') : tr(language, '设置阅读状态', 'Set status')}</button>
        ${status ? `<button class='link danger' type='button' data-action='${escapeHtml(paperAction('user-clear-status', id))}'>${tr(language, '清除状态', 'Clear status')}</button>` : ''}
        <button class='link' type='button' data-action='${escapeHtml(paperAction('user-folders', id))}'>${tr(language, '管理收藏夹', 'Manage folders')}</button>
        ${state.note ? `<button class='link' type='button' data-action='${escapeHtml(paperAction('user-edit-note', id))}'>${tr(language, '编辑备注', 'Edit note')}</button><button class='link danger' type='button' data-action='${escapeHtml(paperAction('user-clear-note', id))}'>${tr(language, '删除备注', 'Delete note')}</button>` : `<button class='link' type='button' data-action='${escapeHtml(paperAction('user-edit-note', id))}'>${tr(language, '添加备注', 'Add note')}</button>`}
        ${(state.quickTerms?.length || state.tags?.length) ? `<button class='link danger' type='button' data-action='${escapeHtml(paperAction('user-clear-labels', id))}'>${tr(language, '清除标签', 'Clear labels')}</button>` : ''}
        <button class='link danger' type='button' data-action='${escapeHtml(paperAction('user-clear-paper', id))}'>${tr(language, '清除本篇个人记录', 'Clear personal data')}</button>
      </div>
    </div>`;
  }).join('');
}

function chooseStatus(shell: ShellInstance, paperId: string): void {
  const language = languageOf(shell);
  const rows = store.state.statuses.map((item, index) => `${index + 1}. ${statusLabel(item, language)}`).join('\n');
  const current = store.paper(paperId).statusId;
  const defaultIndex = Math.max(0, store.state.statuses.findIndex(item => item.id === current)) + 1;
  const raw = window.prompt(`${tr(language, '选择阅读状态（输入编号；0 清除）', 'Choose reading status (enter number; 0 clears)')}\n${rows}`, String(defaultIndex || 1));
  if (raw === null) return;
  const index = Number(raw.trim());
  if (index === 0) { store.setStatus(paperId, ''); return; }
  const selected = store.state.statuses[index - 1];
  if (selected) store.setStatus(paperId, selected.id);
}

function manageFolders(shell: ShellInstance, paperId: string): void {
  const language = languageOf(shell);
  const paper = store.paper(paperId);
  const rows = store.state.collections.map((item, index) => `${paper.collections.includes(item.id) ? '✓' : '○'} ${index + 1}. ${item.name}`).join('\n');
  const raw = window.prompt(`${tr(language, '输入收藏夹编号以切换加入/移出；输入 0 清空全部收藏夹。', 'Enter a folder number to toggle membership; enter 0 to clear all folders.')}\n${rows}`);
  if (raw === null) return;
  const index = Number(raw.trim());
  if (index === 0) {
    store.updatePaper(paperId, state => { state.collections = []; });
    return;
  }
  const selected = store.state.collections[index - 1];
  if (!selected) return;
  store.updatePaper(paperId, state => {
    state.collections = state.collections.includes(selected.id)
      ? state.collections.filter(value => value !== selected.id)
      : [...new Set([...state.collections, selected.id])];
    if (state.collections.length) state.favorite = true;
  });
}

function editNote(shell: ShellInstance, paperId: string): void {
  const language = languageOf(shell);
  const current = store.paper(paperId).note || '';
  const next = window.prompt(tr(language, '编辑私人备注', 'Edit private note'), current);
  if (next === null) return;
  store.setNote(paperId, next, true);
}

function clearPaper(shell: ShellInstance, paperId: string): void {
  const language = languageOf(shell);
  const meta = store.metadata(paperId);
  const title = meta?.title || paperId;
  if (!window.confirm(tr(language, `清除“${title}”的收藏、收藏夹、阅读状态、备注和标签？`, `Clear saved state, folders, reading status, note and labels for “${title}”?`))) return;
  store.updatePaper(paperId, state => {
    state.favorite = false;
    state.collections = [];
    delete state.statusId;
    state.note = '';
    state.noteUpdatedAt = Date.now();
    state.quickTerms = [];
    state.tags = [];
  });
}

async function patch(): Promise<void> {
  await customElements.whenDefined(ELEMENT_NAME);
  const ctor = customElements.get(ELEMENT_NAME) as (CustomElementConstructor & { prototype: ShellInstance & Record<PropertyKey, unknown> }) | undefined;
  if (!ctor) return;
  const proto = ctor.prototype as ShellInstance & Record<PropertyKey, any>;
  if (proto[PATCH_FLAG]) return;
  proto[PATCH_FLAG] = true;

  const originalAction = proto.action;
  proto.paperList = function paperList(mode: 'saved' | 'notes'): string {
    return renderPaperList(this, mode);
  };

  proto.action = async function action(actionName: string): Promise<void> {
    const separator = actionName.indexOf(':');
    const verb = separator >= 0 ? actionName.slice(0, separator) : actionName;
    const paperId = separator >= 0 ? decodePaperId(actionName.slice(separator + 1)) : '';
    const language = languageOf(this);

    if (verb === 'user-unfavorite' && paperId) {
      store.updatePaper(paperId, state => { state.favorite = false; state.collections = []; });
      return;
    }
    if (verb === 'user-status' && paperId) { chooseStatus(this, paperId); return; }
    if (verb === 'user-clear-status' && paperId) { store.setStatus(paperId, ''); return; }
    if (verb === 'user-folders' && paperId) { manageFolders(this, paperId); return; }
    if (verb === 'user-edit-note' && paperId) { editNote(this, paperId); return; }
    if (verb === 'user-clear-note' && paperId) {
      if (window.confirm(tr(language, '删除这篇文献的私人备注？', 'Delete the private note for this paper?'))) store.setNote(paperId, '', true);
      return;
    }
    if (verb === 'user-clear-labels' && paperId) {
      store.updatePaper(paperId, state => { state.quickTerms = []; state.tags = []; });
      return;
    }
    if (verb === 'user-clear-paper' && paperId) { clearPaper(this, paperId); return; }

    if (typeof originalAction === 'function') return originalAction.call(this, actionName);
  };

  document.querySelectorAll<ShellInstance>(ELEMENT_NAME).forEach(shell => shell.render?.());
}

void patch();
