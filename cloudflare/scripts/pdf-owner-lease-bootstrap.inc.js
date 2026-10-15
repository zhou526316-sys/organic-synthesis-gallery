// Lightweight PDF owner lease handoff. Bundled before the legacy Bridge runtime.
// This is the ONLY userscript code run on the owner setup page; no collection,
// publisher navigation, or PDF fetch is started by this module.
(() => {
  'use strict';
  if (!['gallery.gczhouwld.com', 'organic-synthesis-gallery-public.pages.dev'].includes(location.hostname)
      || location.pathname !== '/private-pdf-owner-setup.html') return;
  const KEY = 'osg-toc-v6:private-pdf-capture-lease-v1';
  const ENGINE_REVISION = '__OSG_CAPTURE_ENGINE__';
  const CONTEXT = 'owner_isolated_bridge_v2';
  const isRequestId = value => typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  window.addEventListener('message', async event => {
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || !isRequestId(data.requestId)) return;
    const type = String(data.type || '');
    if (type !== 'osg-private-pdf-capture-probe-v1' &&
        type !== 'osg-private-pdf-capture-lease-v1') return;
    const reply = (kind, details = {}) => window.postMessage({
      type: kind, requestId: data.requestId, context: CONTEXT, ...details,
    }, location.origin);

    if (type === 'osg-private-pdf-capture-probe-v1') {
      reply('osg-private-pdf-capture-ready-v1', {
        ok: true, bridgeVersion: String(globalThis.__OSG_BRIDGE_VERSION__ || ''),
        engine: ENGINE_REVISION,
      });
      return;
    }
    if (data.scope !== 'private_pdf_capture') {
      reply('osg-private-pdf-capture-lease-nack-v1', { reason: 'invalid_lease_payload' });
      return;
    }
    try {
      const token = String(data.token || '');
      const expiresAt = Number(data.expiresAt);
      const receivedAt = Date.now();
      if (!/^[A-Za-z0-9_-]{32,160}$/.test(token) ||
          !Number.isSafeInteger(expiresAt) || expiresAt <= receivedAt + 60000) {
        reply('osg-private-pdf-capture-lease-nack-v1', { reason: 'invalid_lease_payload' });
        return;
      }
      if (typeof GM_setValue !== 'function' || typeof GM_getValue !== 'function')
        throw new Error('gm_api_missing');
      await GM_setValue(KEY, {
        token, expiresAt, scope: 'private_pdf_capture',
        receivedAt, revision: '20261006-private-pdf-bundle-v6',
      });
      const saved = await GM_getValue(KEY, null);
      if (!saved || saved.token !== token || saved.scope !== 'private_pdf_capture' ||
          Number(saved.expiresAt) !== expiresAt) throw new Error('gm_lease_readback_failed');
      // ACK reports only that the authenticated lease reached extension-owned
      // storage. The bearer token never appears in an ACK, error, or diagnostic.
      reply('osg-private-pdf-capture-lease-ack-v1', { expiresAt, receivedAt });
    } catch (_) {
      reply('osg-private-pdf-capture-lease-nack-v1', { reason: 'lease_storage_unavailable' });
    }
  });
})();
