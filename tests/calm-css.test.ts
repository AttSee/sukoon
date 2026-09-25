import { describe, expect, it } from 'vitest';
import { calmCss, DOCUMENT_SCOPE, PAUSED_ATTR, SHADOW_SCOPE, STILL_ATTR } from '../src/shared/calm-css';

describe('calm stylesheet', () => {
  const doc = calmCss(DOCUMENT_SCOPE);
  const shadow = calmCss(SHADOW_SCOPE);

  it('finishes motion instead of removing it', () => {
    expect(doc).toContain('animation-duration: 0.01ms !important');
    expect(doc).toContain('animation-iteration-count: 1 !important');
    expect(doc).toContain('animation-timeline: auto !important');
    const universalRule = doc.slice(doc.indexOf('{'), doc.indexOf('}'));
    expect(universalRule).not.toContain('animation: none');
  });

  it('can be paused with one attribute on <html>', () => {
    expect(doc).toContain(`:root:not([${PAUSED_ATTR}]) *`);
  });

  it('covers view transitions and frozen parallax layers', () => {
    expect(doc).toContain('::view-transition-group(*)');
    expect(doc).toContain(`[${STILL_ATTR}]`);
  });

  it('has no :root selectors inside shadow roots', () => {
    expect(shadow).not.toContain(':root');
    expect(shadow).toContain(':host, *, *::before, *::after');
  });
});
