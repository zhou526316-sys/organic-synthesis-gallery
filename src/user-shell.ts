import './user-ui/paper-actions';
import { USER_SHELL_ELEMENT } from './user-ui/library-shell';
import { UserSearchController } from './user-ui/search-controller';
import { WORKER_API_BASE } from './user-ui/shared';

export type UserShellLanguage = 'zh' | 'en';

type IntegrationProbeShell = HTMLElement & {
  integrations?: {
    auth: { google: boolean; wechat: boolean; qq: boolean; email: boolean };
    payments: { wechat: boolean; alipay: boolean };
  } | null;
  render?: () => void;
};

const SESSION_KEY = 'organic-gallery-session-v1';
const AUTH_WINDOW_NAME = 'organic-gallery-auth';
const BROWSER_API_BASE = 'https://organic-synthesis-gallery-public.pages.dev';
const WORKER_ORIGIN = new URL(WORKER_API_BASE).origin;
const productionIntegrationFallback = {
  auth: { google: true, wechat: false, qq: false, email: true },
  payments: { wechat: false, alipay: false },
};

let activeController: UserSearchController | null = null;
let authStorageWatchInstalled = false;
let browserApiFallbackInstalled = false;

function installBrowserApiFallback(): void {
  if (browserApiFallbackInstalled) return;
  browserApiFallbackInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let requestUrl = '';
    if (typeof input === 'string') requestUrl = input;
    else if (input instanceof URL) requestUrl = input.toString();
    else if (input instanceof Request) requestUrl = input.url;

    let rewritten: RequestInfo | URL = input;
    try {
      const parsed = new URL(requestUrl, window.location.href);
      if (parsed.origin === WORKER_ORIGIN) {
        const target = new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, BROWSER_API_BASE);
        if (input instanceof Request) rewritten = new Request(target.toString(), input);
        else rewritten = target.toString();
      }
    } catch { /* preserve the original fetch target */ }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const fetchInit: RequestInit = { ...(init || {}) };
    if (!fetchInit.signal) fetchInit.signal = controller.signal;
    try {
      return await nativeFetch(rewritten, fetchInit);
    } finally {
      window.clearTimeout(timeout);
    }
  }) as typeof window.fetch;
}

function guardSlowIntegrationProbe(shell: HTMLElement): void {
  const target = shell as unknown as IntegrationProbeShell;
  let ticks = 0;
  const timer = window.setInterval(() => {
    ticks += 1;
    if (!target.integrations) {
      target.integrations = productionIntegrationFallback;
      target.render?.();
    }
    if (ticks >= 30 || !shell.isConnected) window.clearInterval(timer);
  }, 3000);
}

function currentReturnUrl(): string {
  const url = new URL(window.location.href);
  url.hash = '';
  return url.toString();
}

function installSafeOAuthPopup(shell: HTMLElement, language: UserShellLanguage): void {
  const shadow = shell.shadowRoot;
  if (!shadow) return;
  shadow.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-action^="provider:"]');
    if (!button || button.disabled) return;
    const provider = (button.dataset.action || '').slice('provider:'.length);
    if (!['google', 'wechat', 'qq'].includes(provider)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const authUrl = `${BROWSER_API_BASE}/api/user-ui/auth/start?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent(currentReturnUrl())}`;
    const popup = window.open('about:blank', AUTH_WINDOW_NAME, 'popup,width=560,height=720,resizable=yes,scrollbars=yes');
    if (!popup) {
      window.alert(language === 'zh' ? '浏览器阻止了登录窗口，请允许本站弹出窗口后重试。' : 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.');
      return;
    }
    try { popup.opener = null; } catch { /* optional hardening */ }
    popup.location.href = authUrl;
  }, { capture: true });
}

function installAuthStorageWatch(): void {
  if (authStorageWatchInstalled) return;
  authStorageWatchInstalled = true;
  window.addEventListener('storage', event => {
    if (event.key === SESSION_KEY && event.oldValue !== event.newValue) window.location.reload();
  });
}

function closeAuthPopupAfterExchange(): void {
  if (window.name !== AUTH_WINDOW_NAME) return;
  let checks = 0;
  const timer = window.setInterval(() => {
    checks += 1;
    let token = '';
    try { token = window.localStorage.getItem(SESSION_KEY) || ''; } catch { /* optional */ }
    const exchangeStillPending = /(?:^#|[&#])auth_(?:code|error)=/.test(window.location.hash);
    if (token && !exchangeStillPending) {
      window.clearInterval(timer);
      window.setTimeout(() => window.close(), 250);
      return;
    }
    if (checks >= 120) window.clearInterval(timer);
  }, 250);
}

installBrowserApiFallback();
installAuthStorageWatch();
closeAuthPopupAfterExchange();

export function mountUserShell(root: HTMLElement, language: UserShellLanguage): void {
  const preservedQuery = activeController?.currentSearch() || '';
  activeController?.destroy();

  const heroTop = root.querySelector<HTMLElement>('.hero-top');
  const languageSwitch = root.querySelector<HTMLElement>('.lang-switch');
  if (!heroTop || !languageSwitch) return;

  const cluster = document.createElement('div');
  cluster.dataset.userUiCluster = 'true';
  cluster.style.display = 'inline-flex';
  cluster.style.alignItems = 'center';
  cluster.style.justifyContent = 'flex-end';
  cluster.style.gap = '8px';
  cluster.style.marginLeft = 'auto';
  cluster.style.flexWrap = 'wrap';

  heroTop.insertBefore(cluster, languageSwitch);
  cluster.appendChild(languageSwitch);

  const shell = document.createElement(USER_SHELL_ELEMENT);
  shell.setAttribute('data-language', language);
  cluster.appendChild(shell);
  guardSlowIntegrationProbe(shell);
  installSafeOAuthPopup(shell, language);

  activeController = new UserSearchController(root, language);
  activeController.start(preservedQuery);
}
