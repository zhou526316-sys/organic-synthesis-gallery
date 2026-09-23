import { STATUS_GLOWS, type StyleDef } from './shared';
import { applyGlowWidth } from './status-glow-width';

const STYLE_ID = 'gallery-card-glow-styles';

/** The user-selected effect decorates the full literature card. Its overlay is
 * noninteractive and never changes the card's dimensions, content or buttons. */
export function applyCardGlow(card: HTMLElement, style?: StyleDef, statusId = ''): void {
  if (!card.matches('#gallery > .card')) return;
  if (!document.getElementById(STYLE_ID)) {
    const stylesheet = document.createElement('style');
    stylesheet.id = STYLE_ID;
    stylesheet.textContent = CARD_GLOW_CSS;
    document.head.appendChild(stylesheet);
  }
  const mode = statusId && style?.glow && STATUS_GLOWS.includes(style.glow) ? style.glow : 'none';
  card.dataset.cardGlow = mode;
  // Retain the preference/width naming; only a card receives these attributes.
  card.dataset.statusGlow = mode;
  card.dataset.statusGlowId = statusId;
  const rgb = (style?.rgb || [93, 109, 219]).map(value => Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0);
  card.style.setProperty('--status-glow-rgb', rgb.join(','));
  applyGlowWidth(card, style?.glowWidth);
}

const CARD_GLOW_CSS = `
#gallery > .card[data-card-glow]{position:relative}
/* Replace the old always-on card border animation. Off really means Off. */
#gallery > .card.user-status-card[data-card-glow]{animation:none;background:#fff;background-size:auto;border-color:var(--line,#dde3ec);box-shadow:0 10px 30px rgba(15,23,42,.035)}
#gallery > .card[data-card-glow]::after{content:none;pointer-events:none}
#gallery > .card[data-card-glow]:not([data-card-glow="none"])::after{
content:'';position:absolute;inset:0;box-sizing:border-box;border-radius:inherit;pointer-events:none;z-index:2;
border:var(--status-glow-width,1px) solid rgba(var(--status-glow-rgb),.8);
box-shadow:inset 0 0 var(--status-glow-blur,7px) var(--status-glow-width,1px) rgba(var(--status-glow-rgb),.35),0 0 var(--status-glow-outer-blur,5px) rgba(var(--status-glow-rgb),.32)
}
#gallery > .card[data-card-glow="rainbow"]::after{
border-color:#a78bfa;
box-shadow:inset var(--status-glow-rainbow-size,2px) 0 var(--status-glow-outer-blur,5px) #38bdf8,inset calc(-1 * var(--status-glow-rainbow-size,2px)) 0 var(--status-glow-outer-blur,5px) #e879f9,inset 0 var(--status-glow-rainbow-size,2px) var(--status-glow-outer-blur,5px) #facc15,inset 0 calc(-1 * var(--status-glow-rainbow-size,2px)) var(--status-glow-outer-blur,5px) #34d399
}
@keyframes status-glow-pulse{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes status-glow-orbit{
0%,100%{box-shadow:inset var(--status-glow-orbit-size,3px) 0 var(--status-glow-blur,7px) rgba(var(--status-glow-rgb),.95)}
25%{box-shadow:inset 0 var(--status-glow-orbit-size,3px) var(--status-glow-blur,7px) rgba(var(--status-glow-rgb),.95)}
50%{box-shadow:inset calc(-1 * var(--status-glow-orbit-size,3px)) 0 var(--status-glow-blur,7px) rgba(var(--status-glow-rgb),.95)}
75%{box-shadow:inset 0 calc(-1 * var(--status-glow-orbit-size,3px)) var(--status-glow-blur,7px) rgba(var(--status-glow-rgb),.95)}
}
@keyframes status-glow-rainbow{0%,100%{filter:hue-rotate(0deg)}50%{filter:hue-rotate(180deg)}}
@media(prefers-reduced-motion:no-preference){
#gallery > .card[data-card-glow="pulse"]::after{animation:status-glow-pulse 2.8s ease-in-out infinite}
#gallery > .card[data-card-glow="orbit"]::after{animation:status-glow-orbit 3.6s linear infinite}
#gallery > .card[data-card-glow="rainbow"]::after{animation:status-glow-rainbow 5s linear infinite}
}
@media(forced-colors:active){#gallery > .card[data-card-glow]::after{display:none!important}}
`;
