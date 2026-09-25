// Code passed to sw.evaluate / page.evaluate runs inside the extension, where `chrome` exists.
import type { Browser } from '@wxt-dev/browser';

declare global {
  const chrome: typeof Browser;
}
