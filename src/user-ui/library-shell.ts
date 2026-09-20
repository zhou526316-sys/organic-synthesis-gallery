import { escapeHtml, makeId, SHAPES, statusLabel, store, WORKER_API_BASE, type ActionKey, type Language, type Shape, type StyleDef } from './shared';

const NAME = 'gallery-user-shell';
const SESSION_KEY = 'organic-gallery-session-v1';
type Tab = 'saved' | 'notes' | 'followed' | 'settings' | 'login';
type Provider = 'google' | 'wechat' | 'qq' | 'email';
interface IntegrationStatus { auth: Record<Provider | 'local', boolean>; }
interface AuthUser { id: string; displayName?: string | null; email?: string | null; avatarUrl?: string | null; localAccount?: boolean; emailVerified?: boolean; }
interface AuthApiErrorData { error?: string; challengeId?: string; retryAfter?: number; attemptsRemaining?: number; }
class AuthApiError extends Error { constructor(message: string, readonly status: number, readonly data: AuthApiErrorData) { super(message); this.name = 'AuthApiError'; } }

function rgbToHex(rgb: [number, number, number]): string { return `#${rgb.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`; }
function hexToRgb(value: string): [number, number, number] { const clean = value.replace('#', ''); return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)]; }
function styleRow(style: StyleDef, prefix: string, label: string): string {
  return `<div class='style-row'><strong>${escapeHtml(label)}</strong><label>RGB <input type='color' data-color='${prefix}' value='${rgbToHex(style.rgb)}'></label><label>Shape <select data-shape='${prefix}'>${SHAPES.map(shape => `<option value='${shape}' ${style.shape === shape ? 'selected' : ''}>${shape}</option>`).join('')}</select></label><label class='upload'>Image <input type='file' accept='image/png,image/jpeg,image/webp' data-image='${prefix}'></label>${style.imageData ? `<button class='link danger' type='button' data-action='clear-image:${prefix}'>× image</button>` : ''}</div>`;
}
function sessionToken(): string { try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } }
function saveSessionToken(value: string): void { try { if (value) localStorage.setItem(SESSION_KEY, value); else localStorage.removeItem(SESSION_KEY); } catch { /* optional */ } }
function returnUrl(): string { const url = new URL(location.href); url.hash = ''; return url.toString(); }

export class GalleryUserShell extends HTMLElement {
  private readonly shadow = this.attachShadow({ mode: 'open' });
  private open = false;
  private tab: Tab = 'saved';
  private integrationMessage = '';
  private integrations: IntegrationStatus | null = null;
  private authUser: AuthUser | null = null;
  private authMode: 'login' | 'register' = 'login';
  private authFlow: 'credentials' | 'register-code' | 'forgot-email' | 'reset-code' = 'credentials';
  private registerChallengeId = '';
  private registerEmail = '';
  private resetChallengeId = '';
  private resetEmail = '';
  private verifyChallengeId = '';
  private readonly rerender = (): void => this.render();
  private readonly outside = (event: PointerEvent): void => { if (this.open && !event.composedPath().includes(this)) { this.open = false; this.render(); } };

  static get observedAttributes(): string[] { return ['data-language', 'data-current-query']; }
  connectedCallback(): void {
    document.addEventListener('pointerdown', this.outside);
    store.addEventListener('change', this.rerender);
    this.render();
    void this.refreshIntegrations();
    void this.consumeAuthHash();
  }
  disconnectedCallback(): void { document.removeEventListener('pointerdown', this.outside); store.removeEventListener('change', this.rerender); }
  attributeChangedCallback(): void { if (this.isConnected) this.render(); }
  private get language(): Language { return this.dataset.language === 'en' ? 'en' : 'zh'; }
  private tr(zh: string, en: string): string { return this.language === 'zh' ? zh : en; }

  private render(): void {
    this.shadow.innerHTML = `<style>
      :host{position:relative;display:inline-flex;flex:0 0 auto;font:12px/1.45 Inter,system-ui,sans-serif;color:#172033}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}.trigger{min-height:34px;padding:6px 11px;border:1px solid #d7deea;border-radius:10px;background:#fff;color:#334155;font-weight:700}.trigger:hover{border-color:#9fb7f7;color:#3159bd}.panel{position:absolute;right:0;top:calc(100% + 9px);z-index:10010;width:min(560px,calc(100vw - 28px));max-height:min(68vh,620px);min-height:0;display:grid;grid-template-columns:132px minmax(0,1fr);overflow:hidden;border:1px solid #dfe5ef;border-radius:16px;background:#fff;box-shadow:0 20px 60px rgba(15,23,42,.2)}.nav{min-height:0;padding:12px;border-right:1px solid #edf0f4;background:#fafbfc}.nav button{width:100%;padding:9px;border:0;border-radius:9px;background:transparent;text-align:left;color:#475467}.nav button.active{background:#eef3ff;color:#3159bd;font-weight:750}.content{min-height:0;padding:16px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.head{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.head h3{margin:0;font-size:17px}.close{border:0;border-radius:8px;width:28px;height:28px;background:#f2f4f7}.item{display:grid;gap:3px;padding:10px 0;border-top:1px solid #edf0f4}.item a{color:#243044;text-decoration:none;font-weight:700}.item small,.help{color:#8a93a3;font-size:10px}.empty{padding:18px 0;color:#8a93a3}.row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.secondary,.link{padding:7px 9px;border:1px solid #dfe5ef;border-radius:9px;background:#fff;color:#475467}.link{border:0;padding:4px;background:transparent;color:#3159bd}.danger{color:#b42318}.section{padding:12px 0;border-top:1px solid #edf0f4}.section h4{margin:0 0 8px}.manage{display:grid;gap:8px}.manage-row{padding:9px;border:1px solid #e5e9f0;border-radius:11px}.manage-row>.top{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.manage-row input[type=text]{min-width:140px;flex:1}.manage-row input[type=text],.manage-row select,.amount,.email{border:1px solid #d7deea;border-radius:8px;padding:6px}.style-row{display:grid;grid-template-columns:minmax(130px,1fr) auto auto auto;align-items:center;gap:7px;padding:8px 0;border-top:1px dashed #e5e9f0}.style-row label{display:flex;align-items:center;gap:4px;font-size:10px}.style-row input[type=color]{width:30px;height:26px;border:0;background:transparent;padding:0}.upload input{width:105px;font-size:9px}.provider{display:grid;gap:7px}.provider button{padding:9px;border:1px solid #e1e6ee;border-radius:10px;background:#fff;text-align:left}.provider button:disabled{cursor:not-allowed;opacity:.52}.provider .ok{color:#27845b}.provider .off{color:#8a93a3}.amounts{display:flex;gap:6px;flex-wrap:wrap}.amounts button{padding:7px 10px;border:1px solid #d7deea;border-radius:9px;background:#fff}.notice{margin-top:10px;padding:9px;border-radius:9px;background:#f8fafc;color:#667085;font-size:10px}.user-card{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e5e9f0;border-radius:11px}.avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;background:#eef1f5}.pay-result{margin-top:10px;padding:10px;border:1px solid #e5e9f0;border-radius:10px;overflow-wrap:anywhere}.pay-result a{color:#3159bd}.email{min-width:220px;flex:1}.auth-tabs{display:flex;gap:6px;margin-bottom:10px}.auth-tabs button{flex:1;padding:8px;border:1px solid #dfe5ef;border-radius:9px;background:#fff;color:#475467}.auth-tabs button.active{border-color:#9fb7f7;background:#eef3ff;color:#3159bd;font-weight:750}.auth-form{display:grid;gap:8px}.auth-form input{width:100%;border:1px solid #d7deea;border-radius:9px;padding:9px}.auth-form .code-input{font-size:18px;letter-spacing:6px;text-align:center;font-weight:750}.account-grid{display:grid;gap:9px;margin-top:10px}.verified{color:#27845b;font-weight:700}.unverified{color:#b54708;font-weight:700}.primary{padding:9px 11px;border:1px solid #3159bd;border-radius:9px;background:#3159bd;color:#fff;font-weight:750}.primary:disabled{cursor:wait;opacity:.7}.auth-notice{margin-top:0;font-size:11px;color:#344054;background:#f2f4f7}.qr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:10px}.qr-card{display:grid;gap:7px;padding:10px;border:1px solid #e5e9f0;border-radius:12px;background:#fff;text-align:center}.qr-card strong{font-size:12px}.qr-card a{display:block;border-radius:10px;overflow:hidden;background:#fff}.qr-card img{display:block;width:100%;aspect-ratio:1;object-fit:contain}.support-note{margin:0;color:#667085;font-size:11px;line-height:1.6}
      @media(max-width:680px){.panel{position:fixed;inset:72px 12px auto;width:auto;height:auto;max-height:min(72dvh,620px);min-height:0;grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);overflow:hidden;border-radius:16px}.nav{display:flex;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid #edf0f4;padding:7px}.nav button{width:auto;white-space:nowrap}.content{min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:12px 12px 28px}.style-row{grid-template-columns:1fr 1fr}.trigger{min-height:32px;padding:5px 9px}}
    </style><button class='trigger' type='button' aria-expanded='${this.open}'>${this.tr('用户中心', 'User Center')}</button>${this.open ? this.panelMarkup() : ''}`;
    this.bind();
  }

  private panelMarkup(): string {
    const tabs: Array<[Tab, string]> = [['saved', this.tr('我的收藏', 'Saved')], ['notes', this.tr('私人备注', 'Notes')], ['followed', this.tr('关注检索', 'Followed')], ['settings', this.tr('个性化设置', 'Settings')], ['login', this.tr('登录', 'Sign in')]];
    return `<section class='panel'><nav class='nav'>${tabs.map(([tab, label]) => `<button type='button' data-tab='${tab}' class='${this.tab === tab ? 'active' : ''}'>${label}</button>`).join('')}</nav><div class='content'><div class='head'><h3>${tabs.find(([tab]) => tab === this.tab)?.[1] || ''}</h3><button class='close' type='button' data-action='close'>×</button></div>${this.tabBody()}</div></section>`;
  }

  private tabBody(): string {
    if (this.tab === 'saved') return this.paperList('saved');
    if (this.tab === 'notes') return this.paperList('notes');
    if (this.tab === 'followed') return this.followed();
    if (this.tab === 'settings') return this.settings();
    return this.login();
  }

  private paperList(mode: 'saved' | 'notes'): string {
    const entries = Object.entries(store.state.papers).filter(([, state]) => mode === 'saved' ? state.favorite : Boolean(state.note)).sort((a, b) => (b[1].lastOpenedAt || b[1].noteUpdatedAt || 0) - (a[1].lastOpenedAt || a[1].noteUpdatedAt || 0));
    if (!entries.length) return `<div class='empty'>${mode === 'saved' ? this.tr('暂无收藏。', 'No saved papers yet.') : this.tr('暂无私人备注。', 'No private notes yet.')}</div>`;
    return entries.map(([id, state]) => {
      const meta = store.metadata(id); const status = state.statusId ? store.status(state.statusId) : undefined;
      return `<div class='item'>${meta?.href ? `<a href='${escapeHtml(meta.href)}' target='_blank' rel='noopener noreferrer'>${escapeHtml(meta.title)}</a>` : `<strong>${escapeHtml(meta?.title || id)}</strong>`}<small>${escapeHtml(meta?.journal || '')}${status ? ` · ${escapeHtml(statusLabel(status, this.language))}` : ''}</small>${mode === 'notes' ? `<div>${escapeHtml(state.note.slice(0, 180))}${state.note.length > 180 ? '…' : ''}</div>` : ''}</div>`;
    }).join('');
  }

  private followed(): string {
    const current = this.dataset.currentQuery?.trim() || '';
    return `<div class='row'><button class='secondary' type='button' data-action='follow-current' ${current ? '' : 'disabled'}>${this.tr('关注当前检索', 'Follow current search')}</button>${current ? `<span class='help'>${escapeHtml(current)}</span>` : ''}</div><div class='section'>${store.state.followedSearches.length ? store.state.followedSearches.map((query, index) => `<div class='item'><button class='link' type='button' data-search='${escapeHtml(query)}'>${escapeHtml(query)}</button><button class='link danger' type='button' data-action='remove-follow:${index}'>${this.tr('删除', 'Delete')}</button></div>`).join('') : `<div class='empty'>${this.tr('暂未关注检索。', 'No followed searches yet.')}</div>`}</div><div class='section'><h4>${this.tr('最近搜索', 'Recent searches')}</h4>${store.state.searchHistory.slice(0, 8).map(query => `<button class='link' type='button' data-search='${escapeHtml(query)}'>${escapeHtml(query)}</button>`).join(' ') || `<span class='help'>${this.tr('暂无记录', 'No history')}</span>`}</div>`;
  }

  private settings(): string {
    const actions: Array<[ActionKey, string]> = [['favorite', this.tr('收藏', 'Save')], ['status', this.tr('阅读状态', 'Status')], ['note', this.tr('备注', 'Note')], ['more', this.tr('更多', 'More')], ['login', this.tr('登录', 'Sign in')]];
    return `<section class='section'><label class='row'><input type='checkbox' data-hide-read ${store.state.hideRead ? 'checked' : ''}>${this.tr('隐藏已读', 'Hide read')}</label></section>
    <section class='section'><h4>${this.tr('阅读状态', 'Reading status')}</h4><div class='manage'>${store.state.statuses.map(status => `<div class='manage-row'><div class='top'><input type='text' data-status-name='${escapeHtml(status.id)}' value='${escapeHtml(status.name)}'><label><input type='checkbox' data-status-read='${escapeHtml(status.id)}' ${status.countsAsRead ? 'checked' : ''}> ${this.tr('计入阅读人数', 'Counts as read')}</label><button class='link danger' type='button' data-action='delete-status:${escapeHtml(status.id)}'>${this.tr('删除', 'Delete')}</button></div>${styleRow(status.style, `status:${status.id}`, '')}</div>`).join('')}</div><button class='secondary' type='button' data-action='add-status'>＋ ${this.tr('添加状态', 'Add status')}</button><div class='help'>${this.tr('默认状态和自定义状态都可以删除；至少保留一个状态。删除后，使用该状态的文献会恢复为未设置状态。', 'Default and custom statuses can both be deleted; at least one status is retained. Papers using a deleted status become unset.')}</div></section>
    <section class='section'><h4>${this.tr('收藏夹', 'Folders')}</h4><div class='row'>${store.state.collections.map(item => `<span>${escapeHtml(item.name)}</span>`).join(' · ')}</div><button class='secondary' type='button' data-action='add-collection'>＋ ${this.tr('新建收藏夹', 'New folder')}</button></section>
    <section class='section'><h4>${this.tr('快速选择', 'Quick choices')}</h4><div class='row'>${store.state.quickTerms.map(item => `<span>${escapeHtml(item.label)}</span>`).join(' · ')}</div><button class='secondary' type='button' data-action='add-quick'>＋ ${this.tr('添加词条', 'Add term')}</button></section>
    <section class='section'><h4>${this.tr('同义词 / 别名组', 'Synonym / alias groups')}</h4>${store.state.aliases.map(item => `<div class='item'><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.terms.join(' · '))}</small><button class='link danger' type='button' data-action='delete-alias:${escapeHtml(item.id)}'>${this.tr('删除', 'Delete')}</button></div>`).join('')}<button class='secondary' type='button' data-action='add-alias'>＋ ${this.tr('添加别名组', 'Add alias group')}</button></section>
    <section class='section'><h4>${this.tr('按钮外观', 'Button appearance')}</h4>${actions.map(([key, label]) => styleRow(store.state.actionStyles[key], `action:${key}`, label)).join('')}</section>
    <div class='notice'>${this.tr('阅读人数目前按本机个人资料去重；登录后账号系统已具备正式 user_id，会在下一步把历史本机记录迁移到账号。', 'Reader counts currently deduplicate by browser profile; signed-in accounts now have formal user_id support, and profile migration can follow.')}</div>`;
  }

  private providerState(provider: Provider): string {
    if (!this.integrations) return this.tr('检测中', 'checking');
    return this.integrations.auth[provider] ? this.tr('可用', 'ready') : this.tr('待配置', 'configuration required');
  }

  private login(): string {
    if (this.authUser) {
      const local = Boolean(this.authUser.localAccount);
      const verified = Boolean(this.authUser.emailVerified);
      const verification = local && this.authUser.email ? `
        <section class='section'>
          <h4>${this.tr('邮箱验证', 'Email verification')}</h4>
          ${verified
            ? `<div class='verified'>✓ ${this.tr('邮箱已验证', 'Email verified')}</div>`
            : `<div class='unverified'>${this.tr('邮箱尚未验证', 'Email not verified')}</div>
               <div class='help' style='margin:5px 0 8px'>${this.tr('这是在启用验证码前创建的账号。验证后可用于安全找回密码。', 'This account predates verification. Verify it to enable secure password recovery.')}</div>
               ${this.verifyChallengeId
                 ? `<div class='auth-form'><input class='code-input' inputmode='numeric' maxlength='6' autocomplete='one-time-code' data-existing-verify-code placeholder='000000'><button class='primary' type='button' data-action='confirm-existing-email'>${this.tr('验证邮箱', 'Verify email')}</button><button class='secondary' type='button' data-action='resend-existing-email'>${this.tr('重新发送验证码', 'Resend code')}</button></div>`
                 : `<button class='secondary' type='button' data-action='start-existing-email'>${this.tr('发送验证码', 'Send verification code')}</button>`}`}
        </section>` : '';

      const passwordTools = local ? `
        <section class='section'>
          <h4>${this.tr('修改密码', 'Change password')}</h4>
          <div class='auth-form'>
            <input type='password' autocomplete='current-password' data-current-password placeholder='${this.tr('当前密码', 'Current password')}'>
            <input type='password' minlength='8' maxlength='128' autocomplete='new-password' data-new-password placeholder='${this.tr('新密码（至少 8 位）', 'New password (8+ characters)')}'>
            <button class='secondary' type='button' data-action='change-password'>${this.tr('修改密码', 'Change password')}</button>
          </div>
        </section>
        <section class='section'><button class='secondary' type='button' data-action='revoke-other-sessions'>${this.tr('退出其他设备', 'Sign out other devices')}</button></section>` : '';

      return `<div class='user-card'>${this.authUser.avatarUrl ? `<img class='avatar' src='${escapeHtml(this.authUser.avatarUrl)}' alt=''>` : `<div class='avatar'></div>`}<div><strong>${escapeHtml(this.authUser.displayName || this.authUser.email || this.authUser.id)}</strong>${this.authUser.email ? `<div class='help'>${escapeHtml(this.authUser.email)}</div>` : ''}</div></div>
        <div class='row' style='margin-top:10px'><button class='secondary' type='button' data-action='logout'>${this.tr('退出登录', 'Sign out')}</button></div>
        ${verification}${passwordTools}
        ${this.integrationMessage ? `<div class='notice'>${escapeHtml(this.integrationMessage)}</div>` : ''}`;
    }

    const enabled = (provider: Provider): string => this.integrations?.auth[provider] ? '' : 'disabled';
    const register = this.authMode === 'register';

    let nativeAccount = '';
    if (this.authFlow === 'register-code') {
      nativeAccount = `<section class='section' style='border-top:0;padding-top:0'>
        <h4>${this.tr('验证邮箱', 'Verify email')}</h4>
        <div class='help' style='margin-bottom:8px'>${this.tr(`验证码已发送至 ${this.registerEmail}，10 分钟内有效。`, `A 6-digit code was sent to ${this.registerEmail}. It is valid for 10 minutes.`)}</div>
        <form class='auth-form' data-register-code-form novalidate>
          <input class='code-input' inputmode='numeric' maxlength='6' autocomplete='one-time-code' data-register-code placeholder='000000'>
          <button class='primary' type='submit'>${this.tr('验证并创建账号', 'Verify and create account')}</button>
          <button class='secondary' type='button' data-action='resend-register-code'>${this.tr('重新发送验证码', 'Resend code')}</button>
          <button class='link' type='button' data-action='cancel-register-code'>${this.tr('返回修改邮箱', 'Use a different email')}</button>
          <div class='notice auth-notice' data-auth-message role='status' aria-live='polite' ${this.integrationMessage ? '' : 'hidden'}>${escapeHtml(this.integrationMessage)}</div>
        </form>
      </section>`;
    } else if (this.authFlow === 'forgot-email') {
      nativeAccount = `<section class='section' style='border-top:0;padding-top:0'>
        <h4>${this.tr('忘记密码', 'Forgot password')}</h4>
        <form class='auth-form' data-reset-start-form novalidate>
          <input type='email' autocomplete='email' data-reset-email placeholder='name@example.com'>
          <button class='primary' type='submit'>${this.tr('发送重置验证码', 'Send reset code')}</button>
          <button class='link' type='button' data-action='back-to-login'>${this.tr('返回登录', 'Back to sign in')}</button>
          <div class='notice auth-notice' data-auth-message role='status' aria-live='polite' ${this.integrationMessage ? '' : 'hidden'}>${escapeHtml(this.integrationMessage)}</div>
        </form>
      </section>`;
    } else if (this.authFlow === 'reset-code') {
      nativeAccount = `<section class='section' style='border-top:0;padding-top:0'>
        <h4>${this.tr('重置密码', 'Reset password')}</h4>
        <div class='help' style='margin-bottom:8px'>${this.tr(`如果该邮箱存在本站账号，验证码已发送至 ${this.resetEmail}。`, `If that email belongs to a site account, a code was sent to ${this.resetEmail}.`)}</div>
        <form class='auth-form' data-reset-confirm-form novalidate>
          <input class='code-input' inputmode='numeric' maxlength='6' autocomplete='one-time-code' data-reset-code placeholder='000000'>
          <input type='password' minlength='8' maxlength='128' autocomplete='new-password' data-reset-new-password placeholder='${this.tr('新密码（至少 8 位）', 'New password (8+ characters)')}'>
          <button class='primary' type='submit'>${this.tr('确认重置密码', 'Reset password')}</button>
          <button class='secondary' type='button' data-action='resend-reset-code'>${this.tr('重新发送验证码', 'Resend code')}</button>
          <button class='link' type='button' data-action='back-to-login'>${this.tr('返回登录', 'Back to sign in')}</button>
          <div class='notice auth-notice' data-auth-message role='status' aria-live='polite' ${this.integrationMessage ? '' : 'hidden'}>${escapeHtml(this.integrationMessage)}</div>
        </form>
      </section>`;
    } else {
      nativeAccount = `<section class='section' style='border-top:0;padding-top:0'>
        <h4>${this.tr('本站账号', 'Site account')}</h4>
        <div class='auth-tabs'>
          <button type='button' data-action='auth-mode:login' class='${register ? '' : 'active'}'>${this.tr('登录', 'Sign in')}</button>
          <button type='button' data-action='auth-mode:register' class='${register ? 'active' : ''}'>${this.tr('注册', 'Register')}</button>
        </div>
        <form class='auth-form' data-native-auth-form data-auth-mode='${register ? 'register' : 'login'}' novalidate>
          ${register ? `<input type='text' maxlength='60' autocomplete='name' data-local-name placeholder='${this.tr('昵称', 'Display name')}'>` : ''}
          <input type='email' autocomplete='email' data-local-email placeholder='name@example.com'>
          <input type='password' minlength='8' maxlength='128' autocomplete='${register ? 'new-password' : 'current-password'}' data-local-password placeholder='${this.tr('密码（至少 8 位）', 'Password (8+ characters)')}'>
          <button class='primary' type='submit' data-native-auth-submit>${register ? this.tr('发送邮箱验证码', 'Send email code') : this.tr('登录本站账号', 'Sign in with site account')}</button>
          ${register ? '' : `<button class='link' type='button' data-action='forgot-password'>${this.tr('忘记密码？', 'Forgot password?')}</button>`}
          <div class='notice auth-notice' data-auth-message role='status' aria-live='polite' ${this.integrationMessage ? '' : 'hidden'}>${escapeHtml(this.integrationMessage)}</div>
        </form>
        <div class='help' style='margin-top:7px'>${register ? this.tr('注册需要先验证邮箱。验证码 10 分钟内有效。', 'Registration requires email verification. Codes are valid for 10 minutes.') : this.tr('本站账号会同步收藏、阅读状态、私人备注和个性化设置。', 'Site accounts sync saved papers, reading status, private notes, and preferences.')}</div>
      </section>`;
    }

    return `${nativeAccount}
      <section class='section'><h4>${this.tr('其他登录方式', 'Other sign-in methods')}</h4><div class='provider'><button type='button' data-action='provider:google' ${enabled('google')}>Google <small class='${this.integrations?.auth.google ? 'ok' : 'off'}'>· ${this.providerState('google')}</small></button><button type='button' data-action='provider:wechat' ${enabled('wechat')}>微信 <small class='${this.integrations?.auth.wechat ? 'ok' : 'off'}'>· ${this.providerState('wechat')}</small></button><button type='button' data-action='provider:qq' ${enabled('qq')}>QQ <small class='${this.integrations?.auth.qq ? 'ok' : 'off'}'>· ${this.providerState('qq')}</small></button></div></section>
      <section class='section'><h4>${this.tr('邮箱免密码登录', 'Passwordless email sign-in')}</h4><div class='row'><input class='email' type='email' data-email placeholder='name@example.com'><button class='secondary' type='button' data-action='email-login' ${enabled('email')}>${this.tr('发送登录链接', 'Send sign-in link')}</button></div><div class='help'>${this.providerState('email')}</div></section>`;
  }

  private bind(): void {
    this.shadow.querySelector('.trigger')?.addEventListener('click', event => { event.stopPropagation(); this.open = !this.open; this.render(); });
    this.shadow.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.addEventListener('click', () => { this.tab = button.dataset.tab as Tab; this.render(); }));
    this.shadow.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => { void this.action(button.dataset.action || ''); }));
    this.shadow.querySelector<HTMLFormElement>('[data-native-auth-form]')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      void this.submitNativeAccount(form.dataset.authMode === 'register');
    });
    this.shadow.querySelector<HTMLFormElement>('[data-register-code-form]')?.addEventListener('submit', event => {
      event.preventDefault();
      void this.verifyRegistrationCode();
    });
    this.shadow.querySelector<HTMLFormElement>('[data-reset-start-form]')?.addEventListener('submit', event => {
      event.preventDefault();
      void this.startPasswordReset();
    });
    this.shadow.querySelector<HTMLFormElement>('[data-reset-confirm-form]')?.addEventListener('submit', event => {
      event.preventDefault();
      void this.confirmPasswordReset();
    });
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

  private setAuthMessage(message: string): void {
    this.integrationMessage = message;
    const notice = this.shadow.querySelector<HTMLElement>('[data-auth-message]');
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = !message;
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = sessionToken();
    const headers = new Headers(init.headers || {});
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${WORKER_API_BASE}${path}`, { ...init, headers });
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new AuthApiError(data.error || `HTTP ${response.status}`, response.status, data as AuthApiErrorData);
    return data;
  }

  private async refreshIntegrations(): Promise<void> {
    try { this.integrations = await this.api<IntegrationStatus>('/api/user-ui/integrations'); }
    catch { this.integrations = null; }
    if (sessionToken()) await this.refreshSession();
    this.render();
  }

  private async refreshSession(): Promise<void> {
    try {
      const result = await this.api<{ authenticated: boolean; user: AuthUser | null }>('/api/user-ui/auth/session');
      this.authUser = result.authenticated ? result.user : null;
      if (!result.authenticated) saveSessionToken('');
    } catch { this.authUser = null; }
  }

  private async consumeAuthHash(): Promise<void> {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const code = params.get('auth_code');
    const error = params.get('auth_error');
    if (error) {
      this.integrationMessage = this.tr(`登录失败：${error}`, `Sign-in failed: ${error}`);
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      this.render();
      return;
    }
    if (!code) return;
    try {
      const result = await this.api<{ token: string; user: AuthUser }>('/api/user-ui/auth/exchange', { method: 'POST', body: JSON.stringify({ code }) });
      saveSessionToken(result.token);
      this.authUser = result.user;
      this.integrationMessage = this.tr('登录成功。', 'Signed in.');
    } catch {
      this.integrationMessage = this.tr('登录交换码无效或已过期。', 'The sign-in exchange code is invalid or expired.');
    }
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    this.render();
  }

  private authErrorMessage(error: unknown): string {
    const code = error instanceof Error ? error.message : String(error);
    const known: Record<string, string> = {
      invalid_credentials: this.tr('邮箱或密码错误。', 'Incorrect email or password.'),
      email_already_registered: this.tr('该邮箱已经存在账号，请直接登录。', 'An account already uses this email. Sign in instead.'),
      invalid_email: this.tr('邮箱格式不正确。', 'Invalid email address.'),
      invalid_password: this.tr('密码需要 8–128 位。', 'Password must be 8–128 characters.'),
      invalid_display_name: this.tr('昵称无效。', 'Invalid display name.'),
      invalid_code: this.tr('验证码错误。', 'Incorrect verification code.'),
      code_expired: this.tr('验证码已过期，请重新发送。', 'The code expired. Request a new one.'),
      too_many_code_attempts: this.tr('验证码错误次数过多，请重新发送。', 'Too many incorrect attempts. Request a new code.'),
      code_cooldown: this.tr('发送过于频繁，请稍后再试。', 'Please wait before requesting another code.'),
      email_delivery_failed: this.tr('验证码邮件发送失败，请稍后重试。', 'Verification email could not be sent. Try again later.'),
      registration_failed: this.tr('注册失败，请稍后重试。', 'Registration failed. Try again later.'),
      invalid_current_password: this.tr('当前密码不正确。', 'Current password is incorrect.'),
      not_authenticated: this.tr('登录状态已失效，请重新登录。', 'Your session expired. Sign in again.'),
    };
    return known[code] || this.tr(`操作失败：${code}`, `Request failed: ${code}`);
  }

  private async submitNativeAccount(register: boolean): Promise<void> {
    const emailInput = this.shadow.querySelector<HTMLInputElement>('[data-local-email]');
    const passwordInput = this.shadow.querySelector<HTMLInputElement>('[data-local-password]');
    const nameInput = this.shadow.querySelector<HTMLInputElement>('[data-local-name]');
    const submit = this.shadow.querySelector<HTMLButtonElement>('[data-native-auth-submit]');
    const email = emailInput?.value.trim().toLowerCase() || '';
    const password = passwordInput?.value || '';
    const displayName = nameInput?.value.trim() || '';

    if (!email) { this.setAuthMessage(this.tr('请输入邮箱。', 'Enter an email address.')); emailInput?.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.setAuthMessage(this.tr('邮箱格式不正确。', 'Invalid email address.')); emailInput?.focus(); return; }
    if (password.length < 8 || password.length > 128) { this.setAuthMessage(this.tr('密码需要 8–128 位。', 'Password must be 8–128 characters.')); passwordInput?.focus(); return; }
    if (register && !displayName) { this.setAuthMessage(this.tr('请输入昵称。', 'Enter a display name.')); nameInput?.focus(); return; }

    const originalLabel = submit?.textContent || '';
    if (submit) {
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      submit.textContent = this.tr(register ? '正在发送验证码…' : '正在登录…', register ? 'Sending code…' : 'Signing in…');
    }
    this.setAuthMessage('');

    try {
      if (register) {
        const result = await this.api<{ accepted: boolean; verificationRequired: boolean; challengeId: string }>('/api/user-ui/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, displayName }),
        });
        this.registerChallengeId = result.challengeId;
        this.registerEmail = email;
        this.authFlow = 'register-code';
        this.integrationMessage = this.tr('验证码已发送，请检查邮箱。', 'Verification code sent. Check your email.');
        this.render();
        return;
      }

      const result = await this.api<{ token: string; user: AuthUser }>('/api/user-ui/auth/password/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSessionToken(result.token);
      this.authUser = result.user;
      this.integrationMessage = this.tr('登录成功。', 'Signed in.');
      this.render();
    } catch (error) {
      const apiError = error instanceof AuthApiError ? error : null;
      if (register && apiError?.message === 'code_cooldown' && apiError.data.challengeId) {
        this.registerChallengeId = apiError.data.challengeId;
        this.registerEmail = email;
        this.authFlow = 'register-code';
        this.integrationMessage = this.tr('验证码已经发送，请检查邮箱。', 'A verification code was already sent. Check your email.');
        this.render();
        return;
      }
      this.setAuthMessage(this.authErrorMessage(error));
      if (submit) {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        submit.textContent = originalLabel;
      }
    }
  }

  private async verifyRegistrationCode(): Promise<void> {
    const input = this.shadow.querySelector<HTMLInputElement>('[data-register-code]');
    const code = input?.value.trim() || '';
    if (!/^\d{6}$/.test(code)) { this.setAuthMessage(this.tr('请输入 6 位验证码。', 'Enter the 6-digit code.')); input?.focus(); return; }
    this.setAuthMessage('');
    try {
      const result = await this.api<{ token: string; user: AuthUser }>('/api/user-ui/auth/register/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId: this.registerChallengeId, code }),
      });
      saveSessionToken(result.token);
      this.authUser = result.user;
      this.registerChallengeId = '';
      this.registerEmail = '';
      this.authFlow = 'credentials';
      this.integrationMessage = this.tr('邮箱验证成功，账号已创建并登录。', 'Email verified. Your account has been created and signed in.');
      this.render();
    } catch (error) {
      this.setAuthMessage(this.authErrorMessage(error));
    }
  }

  private async resendRegistrationCode(): Promise<void> {
    try {
      await this.api('/api/user-ui/auth/register/resend', {
        method: 'POST',
        body: JSON.stringify({ challengeId: this.registerChallengeId }),
      });
      this.setAuthMessage(this.tr('新的验证码已发送。', 'A new verification code was sent.'));
    } catch (error) {
      this.setAuthMessage(this.authErrorMessage(error));
    }
  }

  private async startPasswordReset(): Promise<void> {
    const input = this.shadow.querySelector<HTMLInputElement>('[data-reset-email]');
    const email = input?.value.trim().toLowerCase() || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.setAuthMessage(this.tr('请输入有效邮箱。', 'Enter a valid email address.')); input?.focus(); return; }
    try {
      const result = await this.api<{ challengeId: string }>('/api/user-ui/auth/password/reset/start', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      this.resetChallengeId = result.challengeId;
      this.resetEmail = email;
      this.authFlow = 'reset-code';
      this.integrationMessage = this.tr('如果该邮箱存在本站账号，验证码已经发送。', 'If that email belongs to a site account, a reset code has been sent.');
      this.render();
    } catch (error) {
      this.setAuthMessage(this.authErrorMessage(error));
    }
  }

  private async confirmPasswordReset(): Promise<void> {
    const codeInput = this.shadow.querySelector<HTMLInputElement>('[data-reset-code]');
    const passwordInput = this.shadow.querySelector<HTMLInputElement>('[data-reset-new-password]');
    const code = codeInput?.value.trim() || '';
    const password = passwordInput?.value || '';
    if (!/^\d{6}$/.test(code)) { this.setAuthMessage(this.tr('请输入 6 位验证码。', 'Enter the 6-digit code.')); return; }
    if (password.length < 8 || password.length > 128) { this.setAuthMessage(this.tr('密码需要 8–128 位。', 'Password must be 8–128 characters.')); return; }
    try {
      await this.api('/api/user-ui/auth/password/reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ challengeId: this.resetChallengeId, code, newPassword: password }),
      });
      this.authFlow = 'credentials';
      this.authMode = 'login';
      this.resetChallengeId = '';
      this.resetEmail = '';
      this.integrationMessage = this.tr('密码已重置，请使用新密码登录。', 'Password reset. Sign in with your new password.');
      this.render();
    } catch (error) {
      this.setAuthMessage(this.authErrorMessage(error));
    }
  }

  private async resendResetCode(): Promise<void> {
    try {
      await this.api('/api/user-ui/auth/password/reset/resend', {
        method: 'POST',
        body: JSON.stringify({ challengeId: this.resetChallengeId }),
      });
      this.setAuthMessage(this.tr('新的验证码已发送。', 'A new reset code was sent.'));
    } catch (error) {
      this.setAuthMessage(this.authErrorMessage(error));
    }
  }

  private async startExistingEmailVerification(): Promise<void> {
    try {
      const result = await this.api<{ verified?: boolean; challengeId?: string; user?: AuthUser }>('/api/user-ui/auth/email/verify/start', { method: 'POST', body: '{}' });
      if (result.verified) {
        if (result.user) this.authUser = result.user;
        this.integrationMessage = this.tr('邮箱已经验证。', 'Email is already verified.');
      } else {
        this.verifyChallengeId = result.challengeId || '';
        this.integrationMessage = this.tr('验证码已发送，请检查邮箱。', 'Verification code sent. Check your email.');
      }
      this.render();
    } catch (error) {
      this.integrationMessage = this.authErrorMessage(error);
      this.render();
    }
  }

  private async confirmExistingEmailVerification(): Promise<void> {
    const input = this.shadow.querySelector<HTMLInputElement>('[data-existing-verify-code]');
    const code = input?.value.trim() || '';
    if (!/^\d{6}$/.test(code)) { this.integrationMessage = this.tr('请输入 6 位验证码。', 'Enter the 6-digit code.'); this.render(); return; }
    try {
      const result = await this.api<{ verified: boolean; user: AuthUser }>('/api/user-ui/auth/email/verify/confirm', {
        method: 'POST',
        body: JSON.stringify({ challengeId: this.verifyChallengeId, code }),
      });
      this.authUser = result.user;
      this.verifyChallengeId = '';
      this.integrationMessage = this.tr('邮箱验证成功。', 'Email verified.');
      this.render();
    } catch (error) {
      this.integrationMessage = this.authErrorMessage(error);
      this.render();
    }
  }

  private async resendExistingEmailVerification(): Promise<void> {
    try {
      await this.api('/api/user-ui/auth/email/verify/resend', {
        method: 'POST',
        body: JSON.stringify({ challengeId: this.verifyChallengeId }),
      });
      this.integrationMessage = this.tr('新的验证码已发送。', 'A new verification code was sent.');
      this.render();
    } catch (error) {
      this.integrationMessage = this.authErrorMessage(error);
      this.render();
    }
  }

  private async changePassword(): Promise<void> {
    const currentInput = this.shadow.querySelector<HTMLInputElement>('[data-current-password]');
    const nextInput = this.shadow.querySelector<HTMLInputElement>('[data-new-password]');
    const currentPassword = currentInput?.value || '';
    const newPassword = nextInput?.value || '';
    if (newPassword.length < 8 || newPassword.length > 128) { this.integrationMessage = this.tr('新密码需要 8–128 位。', 'New password must be 8–128 characters.'); this.render(); return; }
    try {
      const result = await this.api<{ token: string; user: AuthUser }>('/api/user-ui/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      saveSessionToken(result.token);
      this.authUser = result.user;
      this.integrationMessage = this.tr('密码已修改，其他旧登录会话已失效。', 'Password changed. Older sessions are no longer valid.');
      this.render();
    } catch (error) {
      this.integrationMessage = this.authErrorMessage(error);
      this.render();
    }
  }

  private async revokeOtherSessions(): Promise<void> {
    try {
      const result = await this.api<{ revoked: number }>('/api/user-ui/auth/sessions/revoke-others', { method: 'POST', body: '{}' });
      this.integrationMessage = this.tr(`已退出其他设备（${result.revoked} 个会话）。`, `Signed out ${result.revoked} other session(s).`);
      this.render();
    } catch (error) {
      this.integrationMessage = this.authErrorMessage(error);
      this.render();
    }
  }

  private async startProvider(provider: Exclude<Provider, 'email'>): Promise<void> {
    if (!this.integrations?.auth[provider]) return;
    location.href = `${WORKER_API_BASE}/api/user-ui/auth/start?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent(returnUrl())}`;
  }

  private async startEmail(): Promise<void> {
    const email = this.shadow.querySelector<HTMLInputElement>('[data-email]')?.value.trim() || '';
    if (!email) { this.integrationMessage = this.tr('请输入邮箱。', 'Enter an email address.'); this.render(); return; }
    try {
      await this.api('/api/user-ui/auth/email/start', { method: 'POST', body: JSON.stringify({ email, returnTo: returnUrl() }) });
      this.integrationMessage = this.tr('登录链接已发送，请检查邮箱。', 'A sign-in link has been sent.');
    } catch (error) { this.integrationMessage = error instanceof Error ? error.message : String(error); }
    this.render();
  }

  private async action(action: string): Promise<void> {
    if (action === 'close') { this.open = false; this.render(); return; }
    if (action === 'follow-current') { store.follow(this.dataset.currentQuery || ''); return; }
    if (action.startsWith('remove-follow:')) { store.state.followedSearches.splice(Number(action.slice(14)), 1); store.save(); return; }
    if (action === 'add-status') { const name = prompt(this.tr('新的阅读状态名称', 'New reading status name')); if (name?.trim()) { store.state.statuses.push({ id: makeId('status'), name: name.trim(), style: { rgb: [119,96,168], shape: 'pill' }, countsAsRead: true }); store.save(); } return; }
    if (action.startsWith('delete-status:')) {
      const id = action.slice(14); const current = store.status(id);
      if (!current) return;
      if (store.state.statuses.length <= 1) { alert(this.tr('至少保留一个阅读状态。', 'Keep at least one reading status.')); return; }
      if (!confirm(this.tr(`删除阅读状态“${current.name}”？使用该状态的文献会恢复为未设置。`, `Delete reading status “${current.name}”? Papers using it will become unset.`))) return;
      store.state.statuses = store.state.statuses.filter(item => item.id !== id);
      Object.values(store.state.papers).forEach(paper => { if (paper.statusId === id) delete paper.statusId; });
      store.save(); return;
    }
    if (action === 'add-collection') { const name = prompt(this.tr('收藏夹名称', 'Folder name')); if (name?.trim()) { store.state.collections.push({ id: makeId('collection'), name: name.trim() }); store.save(); } return; }
    if (action === 'add-quick') { const label = prompt(this.tr('快速选择词条', 'Quick-choice term')); if (label?.trim()) { store.state.quickTerms.push({ id: makeId('quick'), label: label.trim(), style: { rgb: [96,116,145], shape: 'pill' } }); store.save(); } return; }
    if (action === 'add-alias') { const name = prompt(this.tr('概念组名称', 'Concept group name')); if (!name?.trim()) return; const raw = prompt(this.tr('同义词/别名，用逗号分隔', 'Synonyms/aliases separated by commas')); const terms = (raw || '').split(/[,，;]/).map(value => value.trim()).filter(Boolean); if (terms.length) { store.state.aliases.push({ id: makeId('alias'), name: name.trim(), terms }); store.save(); } return; }
    if (action.startsWith('delete-alias:')) { store.state.aliases = store.state.aliases.filter(item => item.id !== action.slice(13)); store.save(); return; }
    if (action.startsWith('clear-image:')) { const target = this.styleTarget(action.slice(12)); if (target) { delete target.imageData; store.save(); } return; }
    if (action === 'auth-mode:login') { this.authMode = 'login'; this.authFlow = 'credentials'; this.integrationMessage = ''; this.render(); return; }
    if (action === 'auth-mode:register') { this.authMode = 'register'; this.authFlow = 'credentials'; this.integrationMessage = ''; this.render(); return; }
    if (action === 'forgot-password') { this.authFlow = 'forgot-email'; this.integrationMessage = ''; this.render(); return; }
    if (action === 'back-to-login') { this.authFlow = 'credentials'; this.authMode = 'login'; this.integrationMessage = ''; this.render(); return; }
    if (action === 'cancel-register-code') { this.authFlow = 'credentials'; this.authMode = 'register'; this.registerChallengeId = ''; this.registerEmail = ''; this.integrationMessage = ''; this.render(); return; }
    if (action === 'resend-register-code') { await this.resendRegistrationCode(); return; }
    if (action === 'resend-reset-code') { await this.resendResetCode(); return; }
    if (action === 'start-existing-email') { await this.startExistingEmailVerification(); return; }
    if (action === 'confirm-existing-email') { await this.confirmExistingEmailVerification(); return; }
    if (action === 'resend-existing-email') { await this.resendExistingEmailVerification(); return; }
    if (action === 'change-password') { await this.changePassword(); return; }
    if (action === 'revoke-other-sessions') { await this.revokeOtherSessions(); return; }
    if (action.startsWith('provider:')) { await this.startProvider(action.slice(9) as Exclude<Provider, 'email'>); return; }
    if (action === 'email-login') { await this.startEmail(); return; }
    if (action === 'logout') {
      try { await this.api('/api/user-ui/auth/logout', { method: 'POST' }); } catch { /* local logout still applies */ }
      saveSessionToken(''); this.authUser = null; this.integrationMessage = this.tr('已退出登录。', 'Signed out.'); this.render(); return;
    }
  }
}

if (!customElements.get(NAME)) customElements.define(NAME, GalleryUserShell);
export const USER_SHELL_ELEMENT = NAME;
