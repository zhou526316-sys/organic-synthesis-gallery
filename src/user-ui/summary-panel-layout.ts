// Summary-only presentation. The four management popovers keep their existing
// button-adjacent layout; no data fetching, reading events or capture logic here.
export const SUMMARY_PANEL_STYLES = `
  .drawer.summary-drawer{width:min(1080px,calc(100vw - 32px));max-height:min(86dvh,900px);padding:20px;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable}
  .summary-drawer .head{top:-20px;align-items:center;padding:12px 0 14px}
  .summary-drawer .head h3{font-size:20px;line-height:1.4}
  .summary-drawer .close{width:40px;height:40px;flex:0 0 40px;font-size:18px}
  .summary-drawer .summary-layout{grid-template-columns:minmax(220px,34%) minmax(0,1fr);gap:24px}
  .summary-drawer .summary-main:only-child{grid-column:1/-1}
  .summary-drawer .summary-toc{min-height:220px;padding:14px}
  .summary-drawer .summary-toc img{max-height:400px}
  .summary-drawer .summary-text{font-size:15px;line-height:1.85;overflow-wrap:anywhere}
  .summary-drawer .summary-state{font-size:14px;line-height:1.8}
  .summary-drawer .summary-tabs{gap:8px;margin-bottom:14px}
  .summary-drawer .summary-tabs button{min-height:40px;padding:8px 16px;font-size:13px}
  .summary-drawer .summary-meta{font-size:11px;line-height:1.6}
  .summary-drawer .summary-open{min-height:40px;align-items:center;font-size:13px}
  @media(max-width:680px){
    .drawer.summary-drawer{width:calc(100vw - 24px);padding:16px;border-radius:16px}
    .summary-drawer .head{top:-16px;padding:8px 0 12px}
    .summary-drawer .head h3{font-size:18px}
    .summary-drawer .summary-layout{grid-template-columns:minmax(0,1fr);gap:16px}
    .summary-drawer .summary-toc{min-height:120px;padding:10px}
    .summary-drawer .summary-toc img{max-height:220px}
    .summary-drawer .summary-text{font-size:14px;line-height:1.8}
  }
`;
const panels = new WeakMap<HTMLElement, () => void>();

function fitPanel(drawer: HTMLElement, anchor: HTMLElement): void {
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  const originX = viewport?.offsetLeft || 0;
  const originY = viewport?.offsetTop || 0;
  const margin = width <= 680 ? 12 : 16;
  const gap = 6;
  drawer.style.width = `${Math.max(0, Math.min(1080, width - margin * 2))}px`;
  drawer.style.maxHeight = `${Math.max(0, Math.min(900, height * 0.86, height - margin * 2))}px`;

  const bounds = drawer.getBoundingClientRect();
  const trigger = anchor.getBoundingClientRect();
  const left = Math.max(originX + margin, Math.min(trigger.left, originX + width - bounds.width - margin));
  const below = trigger.bottom + gap;
  const above = trigger.top - bounds.height - gap;
  let top: number;
  if (below >= originY + margin && below + bounds.height <= originY + height - margin) {
    top = below;
    drawer.dataset.placement = 'below';
  } else if (above >= originY + margin && above + bounds.height <= originY + height - margin) {
    top = above;
    drawer.dataset.placement = 'above';
  } else {
    top = Math.max(originY + margin, Math.min(below, originY + height - bounds.height - margin));
    drawer.dataset.placement = 'viewport-fit';
  }
  // Correct from the panel's actual position instead of assuming its containing
  // block and the host share an origin during responsive card reflow.
  const offsetX = parseFloat(drawer.style.left) || 0;
  const offsetY = parseFloat(drawer.style.top) || 0;
  drawer.style.left = `${offsetX + left - bounds.left}px`;
  drawer.style.top = `${offsetY + top - bounds.top}px`;
  drawer.dataset.anchor = 'summary';
}

function watchPanel(drawer: HTMLElement, anchor: HTMLElement, host: HTMLElement): () => void {
  let frame = 0;
  let disposed = false;
  const connected = (): boolean => drawer.isConnected && anchor.isConnected && host.isConnected;
  const schedule = (): void => {
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!connected()) { dispose(); return; }
      fitPanel(drawer, anchor);
    });
  };
  // A resize event can precede card reflow. Observe the actual box changes and
  // coalesce them into a frame rather than guessing a settling delay.
  const resize = new ResizeObserver(schedule);
  const card = host.closest('.card');
  resize.observe(drawer);
  resize.observe(host);
  if (card) resize.observe(card);
  const removal = new MutationObserver(() => { if (!connected()) dispose(); });
  if (host.shadowRoot) removal.observe(host.shadowRoot, { childList: true });
  const owner = card?.parentNode || host.parentNode;
  if (owner) removal.observe(owner, { childList: true, subtree: true });
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    removal.disconnect();
    drawer.removeEventListener('load', schedule, true);
    panels.delete(drawer);
  };
  drawer.addEventListener('load', schedule, true);
  return schedule;
}

/** Prefer the triggering card; use a bounded viewport fit when it lacks room. */
export function positionSummaryPanel(drawer: HTMLElement, anchor: HTMLElement, host: HTMLElement): void {
  if (!drawer.isConnected || !anchor.isConnected || !host.isConnected) return;
  let schedule = panels.get(drawer);
  if (!schedule) { schedule = watchPanel(drawer, anchor, host); panels.set(drawer, schedule); }
  fitPanel(drawer, anchor);
  schedule();
}
