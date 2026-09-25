/**
 * M1 — The calm layer. "Finish, don't cancel": motion jumps to its end state
 * instead of being removed, so content that animates in never stays hidden.
 *
 * One source produces two stylesheets:
 *  - the document sheet (registered as content-script CSS, before first paint),
 *    scoped so the isolated script can pause it by setting an attribute on <html>;
 *  - the shadow-root sheet (adopted by every shadow root from the MAIN world),
 *    paused by toggling `CSSStyleSheet.disabled`.
 */

export const PAUSED_ATTR = 'data-sukoon-paused';
export const SOFTEN_ATTR = 'data-sukoon-soften';
export const FLASH_DIM_ATTR = 'data-sukoon-flash-dim';
/** Set by the parallax freezer on layers that move with scroll. */
export const STILL_ATTR = 'data-sukoon-still';

export const DOCUMENT_SCOPE = `:root:not([${PAUSED_ATTR}])`;
export const SHADOW_SCOPE = ':host';

const CALM_DECLARATIONS = `
  animation-duration: 0.01ms !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  animation-timeline: auto !important;
  transition-duration: 0.01ms !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
  background-attachment: scroll !important;`;

export function calmCss(scope: string): string {
  const isShadow = scope === SHADOW_SCOPE;
  // Inside a shadow tree `:root` never matches, so descendants are unscoped there.
  const d = isShadow ? '' : `${scope} `;
  const self = isShadow ? ':host' : scope;
  const rules = [
    `${self}, ${d}*, ${d}*::before, ${d}*::after, ${d}*::marker {${CALM_DECLARATIONS}\n}`,
  ];
  if (!isShadow) {
    rules.push(
      // View Transitions are not matched by `*`.
      `${scope}::view-transition-group(*), ${scope}::view-transition-old(*), ${scope}::view-transition-new(*) {
  animation: none !important;
}`,
      // Reveal-on-scroll libraries that hide content until an animation runs.
      `${d}[data-aos], ${d}.wow, ${d}[data-sal] {
  opacity: 1 !important;
  transform: none !important;
  visibility: visible !important;
}`,
      // Parallax layers found by the freezer stay put, whatever the library writes inline.
      `${d}[${STILL_ATTR}] {
  transform: none !important;
  translate: none !important;
}`,
      // Photosensitive mode: soften harsh contrast in moving pictures.
      `:root[${SOFTEN_ATTR}]:not([${PAUSED_ATTR}]) :is(video, canvas, iframe) {
  filter: contrast(0.85) saturate(0.8) !important;
}`,
    );
  }
  // Flash Guard hit: dim moving pictures until the user restores them. Applies even when paused.
  rules.push(
    isShadow
      ? `:host-context([${FLASH_DIM_ATTR}]) :is(video, canvas, img, iframe, svg) {
  filter: brightness(0.35) contrast(0.6) grayscale(1) !important;
}`
      : `:root[${FLASH_DIM_ATTR}] :is(video, canvas, img, iframe, svg, [style*="background-image"]) {
  filter: brightness(0.35) contrast(0.6) grayscale(1) !important;
}`,
  );
  return `/* Sukoon calm layer — generated from src/shared/calm-css.ts */\n${rules.join('\n')}\n`;
}
