/**
 * M2 — The reduced-motion switch.
 *
 * An extension cannot change what `prefers-reduced-motion` evaluates to, but it
 * can rewrite the query itself. The same function is used for CSSOM media rules,
 * `<link media>`, `<source media>` and `window.matchMedia` in the page.
 *
 * Both replacements are valid anywhere inside a compound query, unlike `not all`.
 */

const PRM = /\(\s*prefers-reduced-motion\s*(?::\s*(reduce|no-preference)\s*)?\)/gi;

/** Always true. */
export const MQ_TRUE = '(min-width: 0px)';
/** Always false. */
export const MQ_FALSE = '((max-width: 0px) and (min-width: 1px))';

export function mentionsReducedMotion(query: string): boolean {
  return /prefers-reduced-motion/i.test(query);
}

export function rewriteMedia(query: string): string {
  return query.replace(PRM, (_match, value?: string) =>
    value?.toLowerCase() === 'no-preference' ? MQ_FALSE : MQ_TRUE,
  );
}
