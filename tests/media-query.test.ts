import { describe, expect, it } from 'vitest';
import { MQ_FALSE, MQ_TRUE, mentionsReducedMotion, rewriteMedia } from '../src/shared/media-query';

describe('rewriteMedia', () => {
  it('turns reduce into an always-true condition', () => {
    expect(rewriteMedia('(prefers-reduced-motion: reduce)')).toBe(MQ_TRUE);
  });

  it('turns no-preference into an always-false condition', () => {
    expect(rewriteMedia('(prefers-reduced-motion: no-preference)')).toBe(MQ_FALSE);
  });

  it('treats the boolean form like reduce', () => {
    expect(rewriteMedia('(prefers-reduced-motion)')).toBe(MQ_TRUE);
  });

  it('keeps the rest of a compound query intact', () => {
    expect(rewriteMedia('screen and (min-width: 600px) and (prefers-reduced-motion: no-preference)')).toBe(
      `screen and (min-width: 600px) and ${MQ_FALSE}`,
    );
    expect(rewriteMedia('not all and (prefers-reduced-motion: reduce)')).toBe(`not all and ${MQ_TRUE}`);
  });

  it('handles spacing, case and query lists', () => {
    expect(rewriteMedia('( Prefers-Reduced-Motion :  REDUCE ), print')).toBe(`${MQ_TRUE}, print`);
    expect(rewriteMedia('(prefers-reduced-motion: reduce), (prefers-reduced-motion: no-preference)')).toBe(
      `${MQ_TRUE}, ${MQ_FALSE}`,
    );
  });

  it('leaves unrelated queries alone', () => {
    const q = '(prefers-color-scheme: dark) and (min-width: 40em)';
    expect(rewriteMedia(q)).toBe(q);
    expect(mentionsReducedMotion(q)).toBe(false);
  });

  it('is idempotent', () => {
    const once = rewriteMedia('(prefers-reduced-motion: reduce)');
    expect(rewriteMedia(once)).toBe(once);
    expect(mentionsReducedMotion(once)).toBe(false);
  });
});
