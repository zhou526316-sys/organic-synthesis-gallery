// Summary-only presentation. The four management popovers keep their existing
// button-adjacent layout; no data fetching, reading events or capture logic here.
export const SUMMARY_PANEL_STYLES = `
  .drawer.summary-drawer{width:min(1080px,calc(100vw - 32px));max-height:min(86dvh,900px);padding:20px;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable}
  .summary-drawer .head{top:-20px;align-items:center;padding:12px 0 14px}
  .summary-drawer .head h3{font-size:20px;line-height:1.4}
  .summary-drawer .close{width:40px;height:40px;flex:0 0 40px;font-size:18px}
  .summary-drawer .summary-layout{grid-template-columns:minmax(220px,34%) minmax(0,1fr);gap:24px}
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

/** Prefer the triggering card; fit inside the visual viewport when neither side
 * has enough reading space. Never resize the panel into a narrow vertical strip. */
export function positionSummaryPanel(drawer: HTMLElement, anchor: HTMLElement, host: HTMLElement): void {
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
  const parent = host.getBoundingClientRect();
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
  drawer.style.left = `${Math.round(left - parent.left)}px`;
  drawer.style.top = `${Math.round(top - parent.top)}px`;
  drawer.dataset.anchor = 'summary';
}
