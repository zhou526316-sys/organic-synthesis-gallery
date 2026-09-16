import './user-ui/paper-actions';
import { USER_SHELL_ELEMENT } from './user-ui/library-shell';
import { UserSearchController } from './user-ui/search-controller';

export type UserShellLanguage = 'zh' | 'en';

let activeController: UserSearchController | null = null;

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

  activeController = new UserSearchController(root, language);
  activeController.start(preservedQuery);
}
