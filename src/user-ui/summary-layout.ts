// Summary panels are deliberately larger than anchored management drawers,
// but keep margins around the viewport and never request fullscreen.
let activeDrawer: WeakRef<HTMLElement> | undefined;
let layoutFrame = 0;

function fitSummaryDrawer(drawer: HTMLElement, host: DOMRect): void {
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  const margin = 16;
  drawer.style.width = `${Math.max(1, Math.min(1200, width - margin * 2))}px`;
  drawer.style.maxHeight = `${Math.max(1, Math.min(920, height * 0.84, height - margin * 2))}px`;
  const bounds = drawer.getBoundingClientRect();
  const left = (viewport?.offsetLeft || 0) + (width - bounds.width) / 2;
  const top = (viewport?.offsetTop || 0) + (height - bounds.height) / 2;
  drawer.style.left = `${Math.round(left - host.left)}px`;
  drawer.style.top = `${Math.round(top - host.top)}px`;
  drawer.dataset.anchor = 'summary';
  drawer.dataset.summaryLayout = 'reading';
}

function queueViewportLayout(): void {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    const drawer = activeDrawer?.deref();
    if (!drawer?.isConnected) { activeDrawer = undefined; return; }
    const root = drawer.getRootNode();
    if (root instanceof ShadowRoot) fitSummaryDrawer(drawer, root.host.getBoundingClientRect());
  });
}

// Visual viewport changes need not arrive with window.resize. Remeasure the
// live host after responsive layout settles, without retaining closed drawers.
window.visualViewport?.addEventListener('resize', queueViewportLayout);
window.visualViewport?.addEventListener('scroll', queueViewportLayout);

export function positionSummaryDrawer(drawer: HTMLElement, host: DOMRect): void {
  activeDrawer = new WeakRef(drawer);
  fitSummaryDrawer(drawer, host);
  queueViewportLayout();
}

export const SUMMARY_LAYOUT_CSS = `
.drawer.summary-drawer{width:min(1200px,calc(100vw - 32px));max-height:min(84dvh,920px);padding:20px;overflow:auto;overscroll-behavior:contain}
.summary-drawer .head{top:-20px;padding-top:14px;padding-bottom:14px;gap:18px}
.summary-drawer .head h3{font-size:21px;line-height:1.35}
.summary-drawer .head .help{font-size:13px;line-height:1.55;color:#667085;overflow-wrap:anywhere}
.summary-drawer .close{width:40px;height:40px;flex-shrink:0;font-size:22px}
.summary-drawer .summary-layout{grid-template-columns:minmax(220px,36%) minmax(0,1fr);gap:24px}
.summary-drawer .summary-main:only-child{grid-column:1/-1}
.summary-drawer .summary-toc{min-height:220px;padding:14px}
.summary-drawer .summary-toc img{max-height:420px}
.summary-drawer .summary-text{font-size:16px;line-height:1.8}
.summary-drawer .summary-tabs{gap:8px;margin-bottom:14px}
.summary-drawer .summary-tabs button{font-size:14px;padding:8px 14px}
.summary-drawer .summary-state{font-size:15px;line-height:1.75}
.summary-drawer .summary-meta{font-size:11px;line-height:1.6}
.summary-drawer .summary-open{font-size:14px}
@media(max-width:900px){
  .drawer.summary-drawer{padding:16px}
  .summary-drawer .head{top:-16px}
  .summary-drawer .summary-layout{grid-template-columns:minmax(0,1fr);gap:16px}
  .summary-drawer .summary-toc{min-height:160px}
  .summary-drawer .summary-toc img{max-height:260px}
}
@media(max-width:680px){
  .summary-drawer .summary-text{font-size:15px;line-height:1.75}
  .summary-drawer .head h3{font-size:19px}
  .summary-drawer .head .help{font-size:12px}
}
`;
