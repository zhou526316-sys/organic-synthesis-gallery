import { escapeHtml, makeId, SHAPES, statusLabel, store, type ActionKey, type Language, type Shape, type StyleDef } from './shared';

const NAME = 'gallery-user-shell';
type Tab = 'saved' | 'notes' | 'followed' | 'settings' | 'login' | 'support';

function rgbToHex(rgb: [number, number, number]): string { return `#${rgb.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`; }
function hexToRgb(value: string): [number, number, number] { const clean = value.replace('#', ''); return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)]; }
function styleRow(style: StyleDef, prefix: string, label: string): string {
  return `<div class='style-row'><strong>${escapeHtml(label)}</strong><label>RGB <input type='color' data-color='${prefix}' value='${rgbToHex(style.rgb)}'></label><label>Shape <select data-shape='${prefix}'>${SHAPES.map(shape => `<option value='${shape}' ${style.shape === shape ? 'selected' : ''}>${shape}</option>`).join('')}</select></label><label class='upload'>Image <input type='file' accept='image/png,image/jpeg,image/webp' data-image='${prefix}'></label>${style.imageData ? `<button class='link danger' type='button' data-action='clear-image:${prefix}'>× image</button>` : ''}</div>`;
}

export class GalleryUserShell extends HTMLElement {
  private readonly shadow = this.attachShadow({ mode: 'open' });
  private open = false;
  private tab: Tab = 'saved';
  private supportError = '';
  private readonly rerender = (): void => this.render();
  private readonly outside = (event: PointerEvent): void => { if (this.open && !event.composedPath().includes(this)) { this.open = false; this.render(); } };

  static get observedAttributes(): string[] { return ['data-language', 'data-current-query']; }
  connectedCallback(): void { document.addEventListener('pointerdown', this.outside); store.addEventListener('change', this.rerender); this.render(); }
  disconnectedCallback(): void { document.removeEventListener('pointerdown', this.outside); store.removeEventListener('change', this.rerender); }
  attributeChangedCallback(): void { if (this.isConnected) this.render(); }
  private get language(): Language { return this.dataset.language === 'en' ? 'en' : 'zh'; }
  private tr(zh: string, en: string): string { return this.language === 'zh' ? zh : en; }

  private render(): void {
    this.shadow.innerHTML = `<style>
      :host{position:relative;display:inline-flex;flex:0 0 auto;font:12px/1.45 Inter,system-ui,sans-serif;color:#172033}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}.trigger{min-height:34px;padding:6px 11px;border:1px solid #d7deea;border-radius:10px;background:#fff;color:#334155;font-weight:700}.trigger:hover{border-color:#9fb7f7;color:#3159bd}.panel{position:absolute;right:0;top:calc(100% + 9px);z-index:10010;width:min(650px,calc(100vw - 28px));max-height:min(76vh,720px);display:grid;grid-template-columns:150px minmax(0,1fr);overflow:hidden;border:1px solid #dfe5ef;border-radius:16px;background:#fff;box-shadow:0 20px 60px rgba(15,23,42,.2)}.nav{padding:12px;border-right:1px solid #edf0f4;background:#fafbfc}.nav button{width:100%;padding:9px;border:0;border-radius:9px;background:transparent;text-align:left;color:#475467}.nav button.active{background:#eef3ff;color:#3159bd;font-weight:750}.content{padding:16px;overflow:auto}.head{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.head h3{margin:0;font-size:17px}.close{border:0;border-radius:8px;width:28px;height:28px;background:#f2f4f7}.item{display:grid;gap:3px;padding:10px 0;border-top:1px solid #edf0f4}.item a{color:#243044;text-decoration:none;font-weight:700}.item small,.help{color:#8a93a3;font-size:10px}.empty{padding:18px 0;color:#8a93a3}.row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.secondary,.link{padding:7px 9px;border:1px solid #dfe5ef;border-radius:9px;background:#fff;color:#475467}.link{border:0;padding:4px;background:transparent;color:#3159bd}.danger{color:#b42318}.section{padding:12px 0;border-top:1px solid #edf0f4}.section h4{margin:0 0 8px}.manage{display:grid;gap:8px}.manage-row{padding:9px;border:1px solid #e5e9f0;border-radius:11px}.manage-row>.top{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.manage-row input[type=text]{min-width:140px;flex:1}.manage-row input[type=text],.manage-row select,.amount{border:1px solid #d7deea;border-radius:8px;padding:6px}.style-row{display:grid;grid-template-columns:minmax(130px,1fr) auto auto auto;align-items:center;gap:7px;padding:8px 0;border-top:1px dashed #e5e9f0}.style-row label{display:flex;align-items:center;gap:4px;font-size:10px}.style-row input[type=color]{width:30px;height:26px;border:0;background:transparent;padding:0}.upload input{width:105px;font-size:9px}.provider{display:grid;gap:7px}.provider button{padding:9px;border:1px solid #e1e6ee;border-radius:10px;background:#fff;text-align:left}.amounts{display:flex;gap:6px;flex-wrap:wrap}.amounts button{padding:7px 10px;border:1px solid #d7deea;border-radius:9px;background:#fff}.notice{margin-top:10px;padding:9px;border-radius:9px;background:#f8fafc;color:#667085;font-size:10px}
      @media(max-width:680px){.panel{position:fixed;inset:60px 8px 8px;width:auto;max-height:none;grid-template-columns:1fr;grid-template-rows:auto 1fr}.nav{display:flex;overflow-x:auto;border-right:0;border-bottom:1px solid #edf0f4;padding:7px}.nav button{width:auto;white-space:nowrap}.content{padding:12px}.style-row{grid-template-columns:1fr 1fr}.trigger{min-height:32px;padding:5px 9px}}
    </style><button class='trigger' type='button' aria-expanded='${this.open}'>${this.tr('我的文献', 'My Library')}</button>${this.open ? this.panelMarkup() : ''}`;
    this.bind();
  }

  private panelMarkup(): string {
    const tabs: Array<[Tab, string]> = [['saved', this.tr('我的收藏', 'Saved')], ['notes', this.tr('私人备注', 'Notes')], ['followed', this.tr('关注检索', 'Followed')], ['settings', this.tr('个性化设置', 'Settings')], ['login', this.tr('登录', 'Sign in')], ['support', this.tr('支持本站', 'Support')]];
    return `<section class='panel'><nav class='nav'>${tabs.map(([tab, label]) => `<button type='button' data-tab='${tab}' class='${this.tab === tab ? 'active' : ''}'>${label}</button>`).join('')}</nav><div class='content'><div class='head'><h3>${tabs.find(([tab]) => tab === this.tab)?.[1] || ''}</h3><button class='close' type='button' data-action='close'>×</button></div>${this.tabBody()}</div></section>`;
  }

  private tabBody(): string {
    if (this.tab === 'saved') return this.paperList('saved');
    if (this.tab === 'notes') return this.paperList('notes');
    if (this.tab === 'followed') return this.followed();
    if (this.tab === 'settings') return this.settings();
    if (this.tab === 'login') return this.login();
    return this.support();
  }

  private paperList(mode: 'saved' | 'notes'): string {
    const entries = Object.entries(store.state.papers).filter(([, state]) => mode === 'saved' ? state.favorite : Boolean(state.note)).sort((a, b) => (b[1].lastOpenedAt || b[1].noteUpdatedAt || 0) - (a[1].lastOpenedAt || a[1].noteUpdatedAt || 0));
    if (!entries.length) return `<div class='empty'>${mode === 'saved' ? this.tr('暂无收藏。', 'No saved papers yet.') : this.tr('暂无私人备注。', 'No private notes yet.')}</div>`;
    return entries.map(([id, state]) => { const meta = store.metadata(id); return `<div class='item'>${meta?.href ? `<a href='${escapeHtml(meta.href)}' target='_blank' rel='noopener noreferrer'>${escapeHtml(meta.title)}</a>` : `<strong>${escapeHtml(meta?.title || id)}</strong>`}<small>${escapeHtml(meta?.journal || '')}${state.statusId ? ` · ${escapeHtml(statusLabel(store.status(state.statusId) || store.state.statuses[0], this.language))}` : ''}</small>${mode === 'notes' ? `<div>${escapeHtml(state.note.slice(0, 180))}${state.note.length > 180 ? '…' : ''}</div>` : ''}</div>`; }).join('');
  }

  private followed(): string {
    const current = this.dataset.currentQuery?.trim() || '';
    return `<div class='row'><button class='secondary' type='button' data-action='follow-current' ${current ? '' : 'disabled'}>${this.tr('关注当前检索', 'Follow current search')}</button>${current ? `<span class='help'>${escapeHtml(current)}</span>` : ''}</div><div class='section'>${store.state.followedSearches.length ? store.state.followedSearches.map((query, index) => `<div class='item'><button class='link' type='button' data-search='${escapeHtml(query)}'>${escapeHtml(query)}</button><button class='link danger' type='button' data-action='remove-follow:${index}'>${this.tr('删除', 'Delete')}</button></div>`).join('') : `<div class='empty'>${this.tr('暂未关注检索。', 'No followed searches yet.')}</div>`}</div><div class='section'><h4>${this.tr('最近搜索', 'Recent searches')}</h4>${store.state.searchHistory.slice(0, 8).map(query => `<button class='link' type='button' data-search='${escapeHtml(query)}'>${escapeHtml(query)}</button>`).join(' ') || `<span class='help'>${this.tr('暂无记录', 'No history')}</span>`}</div>`;
  }

  private settings(): string {
    const actions: Array<[ActionKey, string]> = [['favorite', this.tr('收藏', 'Save')], ['status', this.tr('阅读状态', 'Status')], ['note', this.tr('备注', 'Note')], ['more', this.tr('更多', 'More')], ['login', this.tr('登录', 'Sign in')], ['support', this.tr('支持本站', 'Support')]];
    return `<section class='section'><label class='row'><input type='checkbox' data-hide-read ${store.state.hideRead ? 'checked' : ''}>${this.tr('隐藏已读', 'Hide read')}</label></section>
    <section class='section'><h4>${this.tr('阅读状态', 'Reading status')}</h4><div class='manage'>${store.state.statuses.map(status => `<div class='manage-row'><div class='top'><input type='text' data-status-name='${escapeHtml(status.id)}' value='${escapeHtml(status.name)}'><label><input type='checkbox' data-status-read='${escapeHtml(status.id)}' ${status.countsAsRead ? 'checked' : ''}> ${this.tr('计入阅读人数', 'Counts as read')}</label>${store.state.statuses.length > 1 ? `<button class='link danger' type='button' data-action='delete-status:${escapeHtml(status.id)}'>${this.tr('删除', 'Delete')}</button>` : ''}</div>${styleRow(status.style, `status:${status.id}`, '')}</div>`).join('')}</div><button class='secondary' type='button' data-action='add-status'>＋ ${this.tr('添加状态', 'Add status')}</button></section>
    <section class='section'><h4>${this.tr('收藏夹', 'Folders')}</h4><div class='row'>${store.state.collections.map(item => `<span>${escapeHtml(item.name)}</span>`).join(' · ')}</div><button class='secondary' type='button' data-action='add-collection'>＋ ${this.tr('新建收藏夹', 'New folder')}</button></section>
    <section class='section'><h4>${this.tr('快速选择', 'Quick choices')}</h4><div class='row'>${store.state.quickTerms.map(item => `<span>${escapeHtml(item.label)}</span>`).join(' · ')}</div><button class='secondary' type='button' data-action='add-quick'>＋ ${this.tr('添加词条', 'Add term')}</button></section>
    <section class='section'><h4>${this.tr('同义词 / 别名组', 'Synonym / alias groups')}</h4>${store.state.aliases.map(item => `<div class='item'><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.terms.join(' · '))}</small><button class='link danger' type='button' data-action='delete-alias:${escapeHtml(item.id)}'>${this.tr('删除', 'Delete')}</button></div>`).join('')}<button class='secondary' type='button' data-action='add-alias'>＋ ${this.tr('添加别名组', 'Add alias group')}</button></section>
    <section class='section'><h4>${this.tr('按钮外观', 'Button appearance')}</h4>${actions.map(([key, label]) => styleRow(store.state.actionStyles[key], `action:${key}`, label)).join('')}</section>
    <div class='notice'>${this.tr('阅读人数目前按本机个人资料去重；正式账号接入后会改为 user_id 去重。同一身份对同一文献只计一次。', 'Reader counts currently deduplicate by this browser profile. Formal accounts will switch to user_id; one identity counts once per paper.')}</div>`;
  }

  private login(): string { return `<div class='provider'><button type='button' data-action='provider'>Google <small>· ${this.tr('待配置', 'configuration required')}</small></button><button type='button' data-action='provider'>微信 <small>· ${this.tr('待配置', 'configuration required')}</small></button><button type='button' data-action='provider'>QQ <small>· ${this.tr('待配置', 'configuration required')}</small></button><button type='button' data-action='provider'>${this.tr('邮箱登录', 'Email')} <small>· ${this.tr('待配置', 'configuration required')}</small></button></div><div class='notice'>${this.tr('当前不会伪装成已登录。账号提供商配置完成后再启用云端同步。', 'The site does not pretend you are signed in. Cloud sync will be enabled only after provider configuration.')}</div>`; }
  private support(): string { return `<p>${this.tr('最低金额 ¥1。商户支付接口尚未配置，当前操作不会产生真实扣款。', 'Minimum ¥1. Merchant payment is not configured; no real charge can occur.')}</p><div class='amounts'>${[1,5,10,20,50].map(value => `<button type='button' data-amount='${value}'>¥${value}</button>`).join('')}</div><div class='row' style='margin-top:10px'><input class='amount' type='number' min='1' step='1' value='1' data-support-amount><button class='secondary' type='button' data-action='pay'>${this.tr('微信 / 支付宝', 'WeChat / Alipay')}</button></div>${this.supportError ? `<div class='notice danger'>${escapeHtml(this.supportError)}</div>` : ''}`; }

  private bind(): void {
    this.shadow.querySelector('.trigger')?.addEventListener('click', event => { event.stopPropagation(); this.open = !this.open; this.render(); });
    this.shadow.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.addEventListener('click', () => { this.tab = button.dataset.tab as Tab; this.render(); }));
    this.shadow.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => { void this.action(button.dataset.action || ''); }));
    this.shadow.querySelectorAll<HTMLButtonElement>('[data-search]').forEach(button => button.addEventListener('click', () => this.dispatchEvent(new CustomEvent('gallery-search', { bubbles: true, composed: true, detail: { query: button.dataset.search || '' } }))));
    this.shadow.querySelectorAll<HTMLButtonElement>('[data-amount]').forEach(button => button.addEventListener('click', () => { const input = this.shadow.querySelector<HTMLInputElement>('[data-support-amount]'); if (input) input.value = button.dataset.amount || '1'; }));
    this.shadow.querySelector<HTMLInputElement>('[data-hide-read]')?.addEventListener('change', event => { store.state.hideRead = (event.target as HTMLInputElement).checked; store.save(); });
    this.shadow.querySelectorAll<HTMLInputElement>('[data-status-name]').forEach(input => input.addEventListener('change', () => { const item = store.status(input.dataset.statusName || ''); if (item && input.value.trim()) { item.name = input.value.trim(); store.save(); } }));
    this.shadow.querySelectorAll<HTMLInputElement>('[data-status-read]').forEach(input => input.addEventListener('change', () => { const item = store.status(input.dataset.statusRead || ''); if (item) { item.countsAsRead = input.checked; store.save(); } }));
    this.shadow.querySelectorAll<HTMLInputElement>('[data-color]').forEach(input => input.addEventListener('change', () => { const target = this.styleTarget(input.dataset.color || ''); if (target) { target.rgb = hexToRgb(input.value); store.save(); } }));
    this.shadow.querySelectorAll<HTMLSelectElement>('[data-shape]').forEach(select => select.addEventListener('change', () => { const target = this.styleTarget(select.dataset.shape || ''); if (target) { target.shape = select.value as Shape; store.save(); } }));
    this.shadow.querySelectorAll<HTMLInputElement>('[data-image]').forEach(input => input.addEventListener('change', () => { const target = this.styleTarget(input.dataset.image || ''); const file = input.files?.[0]; if (target && file) void store.setImage(target, file); }));
  }

  private styleTarget(value: string): StyleDef | undefined { const [kind, id] = value.split(':'); return kind === 'status' ? store.status(id)?.style : kind === 'action' ? store.state.actionStyles[id as ActionKey] : undefined; }
  private async action(action: string): Promise<void> {
    if (action === 'close') { this.open = false; this.render(); return; }
    if (action === 'follow-current') { store.follow(this.dataset.currentQuery || ''); return; }
    if (action.startsWith('remove-follow:')) { store.state.followedSearches.splice(Number(action.slice(14)), 1); store.save(); return; }
    if (action === 'add-status') { const name = prompt(this.tr('新的阅读状态名称', 'New reading status name')); if (name?.trim()) { store.state.statuses.push({ id: makeId('status'), name: name.trim(), style: { rgb: [119,96,168], shape: 'pill' }, countsAsRead: true }); store.save(); } return; }
    if (action.startsWith('delete-status:')) { const id = action.slice(14); if (store.state.statuses.length > 1) { store.state.statuses = store.state.statuses.filter(item => item.id !== id); Object.values(store.state.papers).forEach(paper => { if (paper.statusId === id) delete paper.statusId; }); store.save(); } return; }
    if (action === 'add-collection') { const name = prompt(this.tr('收藏夹名称', 'Folder name')); if (name?.trim()) { store.state.collections.push({ id: makeId('collection'), name: name.trim() }); store.save(); } return; }
    if (action === 'add-quick') { const label = prompt(this.tr('快速选择词条', 'Quick-choice term')); if (label?.trim()) { store.state.quickTerms.push({ id: makeId('quick'), label: label.trim(), style: { rgb: [96,116,145], shape: 'pill' } }); store.save(); } return; }
    if (action === 'add-alias') { const name = prompt(this.tr('概念组名称', 'Concept group name')); if (!name?.trim()) return; const raw = prompt(this.tr('同义词/别名，用逗号分隔', 'Synonyms/aliases separated by commas')); const terms = (raw || '').split(/[,，;]/).map(value => value.trim()).filter(Boolean); if (terms.length) { store.state.aliases.push({ id: makeId('alias'), name: name.trim(), terms }); store.save(); } return; }
    if (action.startsWith('delete-alias:')) { store.state.aliases = store.state.aliases.filter(item => item.id !== action.slice(13)); store.save(); return; }
    if (action.startsWith('clear-image:')) { const target = this.styleTarget(action.slice(12)); if (target) { delete target.imageData; store.save(); } return; }
    if (action === 'provider') { alert(this.tr('该登录方式需要先完成正式提供商配置。', 'This sign-in method requires provider configuration first.')); return; }
    if (action === 'pay') { const amount = Number(this.shadow.querySelector<HTMLInputElement>('[data-support-amount]')?.value || 0); this.supportError = amount < 1 ? this.tr('最低金额为 ¥1。', 'Minimum amount is ¥1.') : this.tr('支付接口尚未配置，本次不会扣款。', 'Payment is not configured; no charge was made.'); this.render(); }
  }
}

if (!customElements.get(NAME)) customElements.define(NAME, GalleryUserShell);
export const USER_SHELL_ELEMENT = NAME;
