/**
 * User-facing strings that run in the page (panic, Flash Guard, digest chip).
 * Kept out of src/ui/copy.ts so the content script does not pull the whole UI dictionary.
 */
import type { DigestCopy } from './digest';
import type { Locale } from './settings';

export function dirOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export interface PageStrings {
  freeze: { aria: string; textBefore: string; textAfter: string; release: string };
  flashBanner: { text: string; restore: string };
  digest: DigestCopy;
  chip: { dismiss: string; label: string };
  menus: { panic: string; toggleSite: string; options: string };
}

const EN: PageStrings = {
  freeze: {
    aria: 'Sukoon: page frozen',
    textBefore: 'Page frozen. Press ',
    textAfter: ' to release.',
    release: 'Release',
  },
  flashBanner: {
    text: 'Sukoon detected rapid flashing and dimmed moving content.',
    restore: 'Restore',
  },
  digest: {
    scrollRestored: 'Your device is scrolling this page again.',
    videosWaiting: (n) => (n === 1 ? '1 video is waiting for play.' : `${n} videos are waiting for play.`),
    parallaxFrozen: (n) => (n === 1 ? 'A parallax layer is held still.' : `${n} parallax layers are held still.`),
    slidersStopped: (n) => (n === 1 ? '1 self-advancing item is parked.' : `${n} self-advancing items are parked.`),
    siteCalmVersion: 'This site opened its own reduced-motion version.',
    empty: 'This page is already calm.',
    heading: 'What Sukoon did',
  },
  chip: { dismiss: 'Hide', label: 'Sukoon' },
  menus: {
    panic: 'Freeze this page',
    toggleSite: 'Turn Sukoon off / on for this site',
    options: 'Open Sukoon settings',
  },
};

const AR: PageStrings = {
  freeze: {
    aria: 'سكون: الصفحة مجمّدة',
    textBefore: 'جُمّدت الصفحة. اضغط ',
    textAfter: ' للإطلاق.',
    release: 'أطلق',
  },
  flashBanner: {
    text: 'اكتشف سكون وميضًا سريعًا وخفّف المحتوى المتحرك.',
    restore: 'استعد',
  },
  digest: {
    scrollRestored: 'عاد التمرير إلى جهازك.',
    videosWaiting: (n) => (n === 1 ? 'فيديو واحد ينتظر زر التشغيل.' : `${n} فيديوهات تنتظر زر التشغيل.`),
    parallaxFrozen: (n) => (n === 1 ? 'طبقة بارالاكس ثابتة.' : `${n} طبقات بارالاكس ثابتة.`),
    slidersStopped: (n) => (n === 1 ? 'عنصر واحد كان يتقدم وحده وتوقف.' : `${n} عناصر كانت تتقدم وحدها وتوقفت.`),
    siteCalmVersion: 'الموقع فتح نسخته الهادئة.',
    empty: 'هذه الصفحة هادئة أصلًا.',
    heading: 'ماذا فعل سكون',
  },
  chip: { dismiss: 'إخفاء', label: 'سكون' },
  menus: {
    panic: 'جمّد هذه الصفحة',
    toggleSite: 'شغّل سكون أو أوقفه في هذا الموقع',
    options: 'افتح إعدادات سكون',
  },
};

export function pageStrings(locale: Locale): PageStrings {
  return locale === 'ar' ? AR : EN;
}
