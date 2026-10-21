import { pageStrings, type PageStrings } from '../shared/page-strings';
import type { FeatureKey, ImageAnimation, Locale, Mode, PageChip } from '../shared/settings';
import type { SignalKey } from '../shared/sli';

export type { Locale };
export { dirOf } from '../shared/page-strings';

export interface UiCopy {
  brand: string;
  modeLegend: string;
  modes: Record<Mode, { title: string; who: string }>;
  features: Record<FeatureKey, { title: string; detail: string }>;
  images: Record<ImageAnimation, string>;
  signals: Record<SignalKey, string>;
  disclaimer: string;
  changed: string;
  language: {
    title: string;
    detail: string;
    en: string;
    ar: string;
  };
  chipSetting: {
    title: string;
    detail: string;
    options: Record<PageChip, string>;
  };
  popup: {
    loading: string;
    onLabel: string;
    onDescription: string;
    offDescription: string;
    calmHost: (host: string) => string;
    excluded: string;
    excludeHint: string;
    cannotChangePage: string;
    statusOn: string;
    statusOff: string;
    statusExcluded: string;
    sensoryTitle: string;
    measuring: string;
    unavailable: string;
    measureAgain: string;
    sliNow: string;
    sliAsBuilt: string;
    sliSignal: string;
    sliBuilt: string;
    sliNowCol: string;
    sliMax: string;
    sliCaption: string;
    sliToggle: string;
    freeze: string;
    frozen: string;
    released: string;
    cannotFreeze: string;
    flashTitle: string;
    flashDetail: string;
    flashStart: string;
    flashStop: string;
    flashHit: (n: number) => string;
    flashChart: (peak: string, limit: string) => string;
    flashCaption: (limit: string) => string;
    allSettings: string;
    localOnly: string;
  };
  options: {
    loading: string;
    title: string;
    lead: string;
    general: string;
    onLabel: string;
    onDescription: string;
    mode: string;
    protections: string;
    protectionsLead: (mode: string) => string;
    resetPreset: (mode: string) => string;
    imagesTitle: string;
    imagesLead: string;
    excluded: string;
    excludedEmpty: string;
    excludeLabel: string;
    excludeError: string;
    add: string;
    remove: string;
    stopExcluding: (host: string) => string;
    backup: string;
    backupLead: string;
    export: string;
    import: string;
    reset: string;
    exported: string;
    imported: string;
    resetDone: string;
    importBad: string;
    keyboard: string;
    shortcutFreeze: string;
    shortcutToggle: string;
    changeShortcut: string;
    sliHow: string;
    sliHowLead: string;
    about: string;
    aboutPrivacy: string;
    hostTitle: string;
    hostLead: string;
    hostAllow: string;
  };
  welcome: {
    title: string;
    lead: string;
    osHint: string;
    q1: string;
    motion: string;
    flashes: string;
    distraction: string;
    q2: string;
    yes: string;
    no: string;
    suggested: (mode: string, who: string) => string;
    useMode: (mode: string) => string;
  };
  freeze: PageStrings['freeze'];
  flashBanner: PageStrings['flashBanner'];
  digest: PageStrings['digest'];
  chip: PageStrings['chip'];
  menus: PageStrings['menus'];
}

const EN: UiCopy = {
  brand: 'Sukoon',
  modeLegend: 'Mode',
  modes: {
    vestibular: {
      title: 'Vestibular',
      who: 'Dizziness or nausea from motion, parallax and smooth scrolling.',
    },
    photosensitive: {
      title: 'Photosensitive',
      who: 'Photosensitive epilepsy, migraine, sensitivity to flicker.',
    },
    focus: {
      title: 'Focus',
      who: 'ADHD, autism, or anyone distracted by constant movement.',
    },
  },
  features: {
    calmCss: {
      title: 'Calm layer',
      detail: 'CSS animations and transitions jump straight to their final state.',
    },
    reducedMotionSwitch: {
      title: 'Reduced-motion switch',
      detail: "Turns on the calm version many sites already built for 'reduce motion'.",
    },
    deepCoverage: {
      title: 'Deep coverage',
      detail: 'Applies the calm layer inside web components and embedded frames.',
    },
    adapters: {
      title: 'Library adapters',
      detail: 'Stops scripted animation, sliders, marquees, SVG and Lottie loops.',
    },
    scrollGuard: {
      title: 'Scroll guard',
      detail: "Removes smooth-scroll hijacking and restores your device's own scrolling.",
    },
    parallaxFreeze: {
      title: 'Parallax freeze',
      detail: 'Holds layers that move at a different speed while you scroll.',
    },
    mediaGuard: {
      title: 'Media guard',
      detail: 'Videos only play after you press play.',
    },
    softenVideo: {
      title: 'Soften video contrast',
      detail: 'Lowers harsh contrast and saturation in video and canvas.',
    },
  },
  images: {
    none: 'Never animate (show the first frame)',
    once: 'Play once, then stop',
    allowed: 'Allow animation',
  },
  signals: {
    continuous: 'Continuous motion',
    autoMedia: 'Self-playing media',
    scrollLinked: 'Scroll-linked motion',
    autoAdvance: 'Self-advancing content',
    flashRisk: 'Flash risk',
  },
  disclaimer:
    'Sukoon reduces exposure to common motion and flash triggers. It is not a medical device and cannot guarantee protection from seizures or symptoms.',
  changed: ' (changed)',
  language: {
    title: 'Language',
    detail: 'English is the default. Arabic is a second choice and turns the interface right-to-left.',
    en: 'English',
    ar: 'العربية',
  },
  chipSetting: {
    title: 'On-page digest',
    detail: 'A still chip on the page that says what Sukoon calmed. It never animates.',
    options: {
      briefly: 'Show once after the page loads, then hide',
      on: 'Keep the chip on the page',
      off: 'Do not show a chip',
    },
  },
  popup: {
    loading: 'Loading…',
    onLabel: 'Sukoon is on',
    onDescription: 'Calming every site you open.',
    offDescription: 'Paused everywhere. Reload tabs after turning it on.',
    calmHost: (host) => `Calm ${host}`,
    excluded: 'Excluded. Reload the page after turning it back on.',
    excludeHint: 'Turn off to exclude this site.',
    cannotChangePage: 'The browser does not let extensions change this page.',
    statusOn: 'Active on this page',
    statusOff: 'Paused everywhere',
    statusExcluded: 'This site is excluded',
    sensoryTitle: 'Sensory load',
    measuring: 'Measuring…',
    unavailable: 'No measurement here. Reload the page if Sukoon was just installed.',
    measureAgain: 'Measure again',
    sliNow: ' / 100 now',
    sliAsBuilt: 'page as built',
    sliSignal: 'Signal',
    sliBuilt: 'As built',
    sliNowCol: 'Now',
    sliMax: 'Max',
    sliCaption: 'Sensory load breakdown',
    sliToggle: 'Numbers',
    freeze: 'Freeze page now',
    frozen: 'Page frozen. Press Esc on the page to release.',
    released: 'Page released.',
    cannotFreeze: 'This page cannot be frozen.',
    flashTitle: 'Flash Guard',
    flashDetail:
      'Watches this tab locally and dims moving content when flashing passes WCAG limits. Chrome shows a capture indicator while it runs. It shortens exposure but cannot prevent the first second.',
    flashStart: 'Start Flash Guard on this tab',
    flashStop: 'Stop Flash Guard',
    flashHit: (n) => `Flashing detected ${n} time${n === 1 ? '' : 's'}; content dimmed.`,
    flashChart: (peak, limit) =>
      `Flashing area over the last 10 seconds. Peak ${peak}% of the screen; the WCAG limit is ${limit}%.`,
    flashCaption: (limit) => `Flashing area, last 10 s. Dashed line: WCAG 2.3.1 limit (${limit}% of the screen).`,
    allSettings: 'All settings',
    localOnly: 'No servers. Nothing leaves your device.',
  },
  options: {
    loading: 'Loading…',
    title: 'Sukoon settings',
    lead: 'Calm motion, flashing and hijacked scrolling on every site. Everything runs on this device.',
    general: 'General',
    onLabel: 'Sukoon is on',
    onDescription: 'Turning Sukoon off stops it on new pages; reload open tabs to fully restore them.',
    mode: 'Mode',
    protections: 'Protections',
    protectionsLead: (mode) => `The ${mode} mode sets these. Change any of them to fine-tune.`,
    resetPreset: (mode) => `Reset to the ${mode} preset`,
    imagesTitle: 'Animated images',
    imagesLead: 'Uses the browser’s own setting for GIF, APNG and animated WebP, so it applies to every site, including excluded ones.',
    excluded: 'Excluded sites',
    excludedEmpty: 'No excluded sites.',
    excludeLabel: 'Exclude a site',
    excludeError: 'Enter a site like example.com',
    add: 'Add',
    remove: 'Remove',
    stopExcluding: (host) => `Stop excluding ${host}`,
    backup: 'Backup and reset',
    backupLead: 'Settings live on this device only. Export them to move them to another browser or profile.',
    export: 'Export',
    import: 'Import',
    reset: 'Reset everything',
    exported: 'Settings exported.',
    imported: 'Settings imported.',
    resetDone: 'Settings reset to the defaults.',
    importBad: 'That file is not a Sukoon settings export.',
    keyboard: 'Keyboard',
    shortcutFreeze:
      'Alt+Shift+S freezes the page instantly: a still picture of the page covers it, scrolling locks, and everything underneath stops, including canvas and WebGL. Press it again, or Esc, to release.',
    shortcutToggle:
      'Alt+Shift+P turns Sukoon off or on everywhere; the toolbar icon reads off while it is paused. Right-click any page for the same actions.',
    changeShortcut: 'Change the shortcut',
    sliHow: 'How the sensory load index works',
    sliHowLead: 'A guide, not a diagnosis. Each signal is scored from 0 to 1, then multiplied by its published weight:',
    about: 'About',
    aboutPrivacy:
      'Sukoon has no servers and no analytics. Its only network access re-reads stylesheets the site already loaded, without cookies, to find the site’s own reduced-motion styles.',
    hostTitle: 'Sukoon needs access to websites',
    hostLead: 'Your browser asks you to allow this. Sukoon only changes how pages move; it sends nothing anywhere.',
    hostAllow: 'Allow on all sites',
  },
  welcome: {
    title: 'Welcome to Sukoon',
    lead: 'Two questions to pick a starting mode. You can change it at any time.',
    osHint: 'Your system already asks for reduced motion, so the Vestibular mode is suggested.',
    q1: '1. What bothers you most on the web?',
    motion: 'Dizziness or nausea from moving pages and smooth scrolling',
    flashes: 'Flashing or flickering',
    distraction: 'Constant movement pulling my attention',
    q2: '2. Can flashing lights trigger seizures, migraines or headaches for you?',
    yes: 'Yes',
    no: 'No',
    suggested: (mode, who) => `Suggested mode: ${mode}. ${who}`,
    useMode: (mode) => `Use ${mode} mode`,
  },
  ...pageStrings('en'),
};

const AR: UiCopy = {
  brand: 'Sukoon',
  modeLegend: 'الوضع',
  modes: {
    vestibular: {
      title: 'الدهليزي',
      who: 'دوار أو غثيان من الحركة والبارالاكس والتمرير الناعم.',
    },
    photosensitive: {
      title: 'الحساسية للضوء',
      who: 'الصرع الحساس للضوء، الشقيقة، والحساسية للوميض.',
    },
    focus: {
      title: 'التركيز',
      who: 'اضطراب فرط الحركة، التوحد، أو أي شخص يشتّته الحركة المستمرة.',
    },
  },
  features: {
    calmCss: {
      title: 'طبقة الهدوء',
      detail: 'رسوم CSS وانتقالاتها تقفز مباشرة إلى حالتها النهائية.',
    },
    reducedMotionSwitch: {
      title: 'مفتاح تقليل الحركة',
      detail: 'يشغّل النسخة الهادئة التي بنتْها مواقع كثيرة خلف «تقليل الحركة».',
    },
    deepCoverage: {
      title: 'تغطية عميقة',
      detail: 'تطبّق طبقة الهدوء داخل مكوّنات الويب والإطارات المضمّنة.',
    },
    adapters: {
      title: 'محولات المكتبات',
      detail: 'توقف الرسوم البرمجية، والشرائح، والشريط المتحرك، وSVG، وحلقات Lottie.',
    },
    scrollGuard: {
      title: 'حارس التمرير',
      detail: 'يزيل سرقة التمرير الناعم ويعيد تمرير جهازك.',
    },
    parallaxFreeze: {
      title: 'تثبيت البارالاكس',
      detail: 'يثبّت الطبقات التي تتحرك بسرعة مختلفة أثناء التمرير.',
    },
    mediaGuard: {
      title: 'حارس الوسائط',
      detail: 'الفيديو يعمل فقط بعد أن تضغط تشغيل.',
    },
    softenVideo: {
      title: 'تخفيف تباين الفيديو',
      detail: 'يخفض التباين والتشبّع القاسيين في الفيديو والكانفاس.',
    },
  },
  images: {
    none: 'لا تتحرك أبدًا (اعرض الإطار الأول)',
    once: 'شغّل مرة ثم توقف',
    allowed: 'اسمح بالحركة',
  },
  signals: {
    continuous: 'حركة مستمرة',
    autoMedia: 'وسائط تشغّل نفسها',
    scrollLinked: 'حركة مرتبطة بالتمرير',
    autoAdvance: 'محتوى يتقدم وحده',
    flashRisk: 'خطر الوميض',
  },
  disclaimer:
    'سكون يقلّل التعرّض لمحفّزات الحركة والوميض الشائعة. ليس جهازًا طبيًا ولا يضمن الحماية من النوبات أو الأعراض.',
  changed: ' (مُغيَّر)',
  language: {
    title: 'اللغة',
    detail: 'الإنجليزية هي الافتراضي. العربية خيار ثانٍ وتعكس اتجاه الواجهة.',
    en: 'English',
    ar: 'العربية',
  },
  chipSetting: {
    title: 'ملخص على الصفحة',
    detail: 'شريحة ثابتة على الصفحة تقول ماذا هدّأ سكون. لا تتحرك.',
    options: {
      briefly: 'اعرضها مرة بعد التحميل ثم أخفها',
      on: 'أبقِ الشريحة على الصفحة',
      off: 'لا تعرض شريحة',
    },
  },
  popup: {
    loading: 'جارٍ التحميل…',
    onLabel: 'سكون يعمل',
    onDescription: 'يهدّئ كل موقع تفتحه.',
    offDescription: 'متوقف في كل مكان. أعد تحميل التبويبات بعد تشغيله.',
    calmHost: (host) => `هدّئ ${host}`,
    excluded: 'مستثنى. أعد تحميل الصفحة بعد إعادته.',
    excludeHint: 'أوقف هذا لإستثناء الموقع.',
    cannotChangePage: 'المتصفح لا يسمح للإضافات بتغيير هذه الصفحة.',
    statusOn: 'يعمل في هذه الصفحة',
    statusOff: 'متوقف في كل مكان',
    statusExcluded: 'هذا الموقع مستثنى',
    sensoryTitle: 'الحمل الحسي',
    measuring: 'جارٍ القياس…',
    unavailable: 'لا قياس هنا. أعد تحميل الصفحة إن كان سكون قد ثُبّت للتو.',
    measureAgain: 'قِس مرة أخرى',
    sliNow: ' / 100 الآن',
    sliAsBuilt: 'الصفحة كما بُنيت',
    sliSignal: 'الإشارة',
    sliBuilt: 'كما بُنيت',
    sliNowCol: 'الآن',
    sliMax: 'الحد',
    sliCaption: 'تفصيل الحمل الحسي',
    sliToggle: 'الأرقام',
    freeze: 'جمّد الصفحة الآن',
    frozen: 'جُمّدت الصفحة. اضغط Esc في الصفحة للإطلاق.',
    released: 'أُطلقت الصفحة.',
    cannotFreeze: 'لا يمكن تجميد هذه الصفحة.',
    flashTitle: 'حارس الوميض',
    flashDetail:
      'يراقب هذا التبويب محليًا ويخفّف المحتوى المتحرك إذا تجاوز الوميض حدود WCAG. يظهر كروم مؤشر التقاط أثناء التشغيل. يقصّر التعرّض ولا يمنع الثانية الأولى.',
    flashStart: 'شغّل حارس الوميض في هذا التبويب',
    flashStop: 'أوقف حارس الوميض',
    flashHit: (n) => `اكتُشف وميض ${n} ${n === 1 ? 'مرة' : 'مرات'}؛ خُفّف المحتوى.`,
    flashChart: (peak, limit) =>
      `مساحة الوميض خلال آخر 10 ثوان. الذروة ${peak}% من الشاشة؛ حد WCAG هو ${limit}%.`,
    flashCaption: (limit) => `مساحة الوميض، آخر 10 ثوان. الخط المتقطع: حد WCAG 2.3.1 (${limit}% من الشاشة).`,
    allSettings: 'كل الإعدادات',
    localOnly: 'لا خوادم. لا شيء يغادر جهازك.',
  },
  options: {
    loading: 'جارٍ التحميل…',
    title: 'إعدادات سكون',
    lead: 'تهدئة الحركة والوميض وسرقة التمرير في كل موقع. كل شيء يعمل على هذا الجهاز.',
    general: 'عام',
    onLabel: 'سكون يعمل',
    onDescription: 'إيقاف سكون يوقفه في الصفحات الجديدة؛ أعد تحميل التبويبات المفتوحة لاستعادتها بالكامل.',
    mode: 'الوضع',
    protections: 'الحمايات',
    protectionsLead: (mode) => `وضع ${mode} يضبط هذه. غيّر أيًا منها للتعديل.`,
    resetPreset: (mode) => `أعد ضبط وضع ${mode}`,
    imagesTitle: 'الصور المتحركة',
    imagesLead: 'يستخدم إعداد المتصفح نفسه لـ GIF وAPNG وWebP المتحرك، فيسري على كل المواقع بما فيها المستثناة.',
    excluded: 'مواقع مستثناة',
    excludedEmpty: 'لا مواقع مستثناة.',
    excludeLabel: 'استثنِ موقعًا',
    excludeError: 'أدخل موقعًا مثل example.com',
    add: 'أضف',
    remove: 'إزالة',
    stopExcluding: (host) => `توقف عن استثناء ${host}`,
    backup: 'نسخ احتياطي وإعادة ضبط',
    backupLead: 'الإعدادات على هذا الجهاز فقط. صدّرها لنقلها إلى متصفح أو ملف شخصي آخر.',
    export: 'تصدير',
    import: 'استيراد',
    reset: 'إعادة ضبط الكل',
    exported: 'تم تصدير الإعدادات.',
    imported: 'تم استيراد الإعدادات.',
    resetDone: 'أُعيدت الإعدادات إلى الافتراضي.',
    importBad: 'هذا الملف ليس تصدير إعدادات سكون.',
    keyboard: 'لوحة المفاتيح',
    shortcutFreeze:
      'Alt+Shift+S يجمّد الصفحة فورًا: صورة ثابتة تغطيها، يُقفل التمرير، ويتوقف كل ما تحتها بما فيه الكانفاس وWebGL. اضغطها مرة أخرى أو Esc للإطلاق.',
    shortcutToggle: 'Alt+Shift+P يشغّل سكون أو يوقفه في كل مكان؛ تظهر كلمة off على الأيقونة أثناء الإيقاف. انقر باليمين في أي صفحة لنفس الأوامر.',
    changeShortcut: 'غيّر الاختصار',
    sliHow: 'كيف يعمل مؤشر الحمل الحسي',
    sliHowLead: 'دليل لا تشخيص. كل إشارة تُقيَّم من 0 إلى 1 ثم تُضرب في وزنها المنشور:',
    about: 'حول',
    aboutPrivacy:
      'سكون بلا خوادم وبلا تحليلات. شبكة الوصول الوحيدة تعيد قراءة أنماط CSS التي حمّلها الموقع أصلًا، بلا كوكيز، لإيجاد أنماط تقليل الحركة الخاصة بالموقع.',
    hostTitle: 'سكون يحتاج وصولًا إلى المواقع',
    hostLead: 'متصفحك يطلب منك السماح بذلك. سكون يغيّر كيف تتحرك الصفحات فقط؛ ولا يرسل شيئًا إلى أي مكان.',
    hostAllow: 'اسمح في كل المواقع',
  },
  welcome: {
    title: 'مرحبًا في سكون',
    lead: 'سؤالان لاختيار وضع البداية. يمكنك تغييره في أي وقت.',
    osHint: 'نظامك يطلب أصلًا تقليل الحركة، لذلك يُقترح الوضع الدهليزي.',
    q1: '1. ما الذي يزعجك أكثر في الويب؟',
    motion: 'دوار أو غثيان من الصفحات المتحركة والتمرير الناعم',
    flashes: 'وميض أو ارتعاش',
    distraction: 'حركة مستمرة تسحب انتباهي',
    q2: '2. هل يمكن للأضواء الوامضة أن تثير نوبات أو شقيقة أو صداعًا لديك؟',
    yes: 'نعم',
    no: 'لا',
    suggested: (mode, who) => `الوضع المقترح: ${mode}. ${who}`,
    useMode: (mode) => `استخدم وضع ${mode}`,
  },
  ...pageStrings('ar'),
};

const ALL: Record<Locale, UiCopy> = { en: EN, ar: AR };

export function uiCopy(locale: Locale): UiCopy {
  return ALL[locale] ?? EN;
}

/** @deprecated use uiCopy(locale).modes — kept for any leftover imports during the move */
export const MODE_COPY = EN.modes;
export const FEATURE_COPY = EN.features;
export const IMAGE_COPY = EN.images;
export const DISCLAIMER = EN.disclaimer;
