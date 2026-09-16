import './user-ui/paper-actions';
import { USER_SHELL_ELEMENT } from './user-ui/library-shell';
import { UserSearchController } from './user-ui/search-controller';

export type UserShellLanguage = 'zh' | 'en';

type IntegrationProbeShell = HTMLElement & {
  integrations?: {
    auth: { google: boolean; wechat: boolean; qq: boolean; email: boolean };
    payments: { wechat: boolean; alipay: boolean };
  } | null;
  render?: () => void;
};

const productionIntegrationFallback = {
  auth: { google: true, wechat: false, qq: false, email: true },
  payments: { wechat: false, alipay: false },
};

let activeController: UserSearchController | null = null;

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

  activeController = new UserSearchController(root, language);
  activeController.start(preservedQuery);
}
