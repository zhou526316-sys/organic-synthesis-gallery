import { createPdfQueueClient, PDF_QUEUE_CHANGE_KEY } from './queue-client.mjs';
import { normalizeDoi } from '../../shared/pdf-vault-v1.mjs';

/** The queue survives unavailable local file APIs, but never an account change. */
export function mountPdfQueuePanel({ userId, token, assertCurrent, initialDoi = '', onImport }) {
  const section = document.querySelector('#pdf-queue-panel');
  const find = name => section.querySelector(`[data-testid="pdf-vault-queue-${name}"]`);
  const input = find('doi'), status = find('status'), list = find('list');
  const add = find('add'), refreshButton = find('refresh'), more = find('more');
  const client = createPdfQueueClient({ userId, token, assertCurrent });
  let closed = false, busy = false, loaded = false, nextAfter = null, lastRefresh = 0;
  let items = new Map();
  const listeners = [];
  const current = () => { if (closed || assertCurrent() === false) throw new Error('account_changed'); };
  const listen = (target, event, action) => { target.addEventListener(event, action); listeners.push(() => target.removeEventListener(event, action)); };
  const message = (text, state = 'idle') => { status.textContent = text; status.dataset.status = state; };
  const element = (tag, text, className) => { const item = document.createElement(tag); item.textContent = text; if (className) item.className = className; return item; };
  function controls() {
    for (const button of section.querySelectorAll('button')) button.disabled = closed || busy;
    add.disabled = closed || busy || !normalizeDoi(input.value);
    input.disabled = closed || busy;
  }
  function render() {
    current(); list.replaceChildren();
    if (loaded && !items.size) list.append(element('p', '目前没有待电脑获取的文献。', 'queue-empty'));
    for (const item of items.values()) {
      const row = element('article', '', 'queue-row'); row.dataset.queueDoi = item.doi;
      const text = element('div', '', 'queue-copy');
      text.append(element('h3', item.doi), element('span', '待电脑获取', 'queue-label'));
      const actions = element('div', '', 'queue-actions');
      const publisher = element('a', '打开出版社 ↗', 'queue-publisher');
      publisher.href = `https://doi.org/${item.doi}`; publisher.target = '_blank'; publisher.rel = 'noopener noreferrer';
      actions.append(publisher);
      for (const [action, label] of [['import', '导入已下载的 PDF'], ['complete', '标为已处理'], ['cancel', '取消任务']]) {
        const button = element('button', label, 'quiet-button'); button.type = 'button';
        button.dataset.queueAction = action; button.dataset.queueDoi = item.doi; actions.append(button);
      }
      row.append(text, actions); list.append(row);
    }
    more.hidden = !nextAfter;
    controls();
  }
  async function loadPage(append = false) {
    current();
    const page = await client.list({ after: append ? nextAfter || '' : '' });
    current();
    if (!append) items = new Map();
    for (const item of page.items) items.set(item.doi, item);
    nextAfter = page.hasMore ? page.nextAfter : null; loaded = true; lastRefresh = Date.now();
    render();
  }
  function errorText(error) {
    if (error?.code === 'revision_conflict') return '此任务已在另一处更新，列表已重新读取。请核对后再操作。';
    if (error?.code === 'not_authenticated') return '登录已失效，请重新验证账号后再操作。';
    if (error?.code === 'queue_limit') return '待获取队列已达到容量上限，请先处理或取消已有任务。';
    if (error?.code === 'queue_history_limit') return '此账号的获取任务记录已达到上限。已有队列和本地 PDF 仍可使用，请通过主站反馈联系维护者。';
    if (error?.code === 'invalid_doi' || error?.code === 'invalid_request') return '请核对文献 DOI 后重试。';
    return '队列暂时无法同步，未确认本次操作完成。请联网后重试；本地 PDF 仍可单独使用。';
  }
  async function run(action, success) {
    try { current(); } catch { return; }
    if (busy) return;
    busy = true; controls(); message('正在同步待获取队列…', 'busy');
    try {
      await action(); current();
      message(success || '', success ? 'success' : 'idle');
    } catch (error) {
      try { current(); } catch { return; }
      let conflictRefreshed = true;
      if (error?.code === 'revision_conflict') { try { await loadPage(); } catch { conflictRefreshed = false; } }
      try { current(); } catch { return; }
      if (error?.code === 'not_authenticated' || error?.code === 'account_changed') { list.replaceChildren(); items.clear(); loaded = false; }
      message(conflictRefreshed ? errorText(error) : '此任务已在另一处更新；当前列表刷新未完成。请点击刷新队列后再操作。', 'error');
    } finally { if (!closed) { busy = false; controls(); } }
  }
  input.value = initialDoi;
  section.hidden = false;
  message(''); list.replaceChildren();
  listen(input, 'input', controls);
  listen(add, 'click', () => void run(async () => {
    const doi = normalizeDoi(input.value);
    const previous = await client.get(doi); current();
    if (previous?.state !== 'pending') await client.mutate(doi, 'queue', previous?.revision || 0);
    current();
    input.value = doi;
    // The mutation receipt proves completion even if the list refresh later
    // fails. Keeping these distinct avoids retrying an already committed write.
    try { await loadPage(); } catch { current(); }
  }, '已加入待电脑获取；在电脑登录同一账号后可继续处理。'));
  listen(refreshButton, 'click', () => void run(() => loadPage()));
  listen(more, 'click', () => void run(() => loadPage(true)));
  listen(list, 'click', event => {
    const button = event.target instanceof Element ? event.target.closest('button[data-queue-action]') : null;
    if (!button || !list.contains(button)) return;
    try { current(); } catch { return; }
    const item = items.get(button.dataset.queueDoi); if (!item) return;
    if (button.dataset.queueAction === 'import') { onImport?.(item.doi); return; }
    const action = button.dataset.queueAction;
    if (!['cancel', 'complete'].includes(action)) return;
    void run(async () => {
      await client.mutate(item.doi, action, item.revision); current();
      items.delete(item.doi); render();
      try { await loadPage(); } catch { current(); }
    }, action === 'complete' ? '已标为处理完成。各设备能否打开 PDF，仍以各自保存的文件为准。' : '已取消这项待获取任务。');
  });
  const refresh = () => { if (!closed && !busy) void run(() => loadPage()); };
  listen(window, 'storage', event => { if (event.key === PDF_QUEUE_CHANGE_KEY) refresh(); });
  listen(window, 'gallery-pdf-vault-queue-changed', refresh);
  listen(window, 'focus', () => { if (Date.now() - lastRefresh > 30_000) refresh(); });
  void run(() => loadPage());
  return Object.freeze({
    setDoi(doi) { if (!closed && !busy) { input.value = doi; controls(); } },
    close() {
      closed = true; client.close(); for (const stop of listeners) stop();
      items.clear(); list.replaceChildren(); input.value = ''; message(''); section.hidden = true;
    },
  });
}
