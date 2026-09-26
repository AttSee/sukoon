# Changelog

All notable changes to Sukoon are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/),
and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-26

First release.

### Added

- Calm layer registered before first paint: animations and transitions finish instantly instead of being removed.
- Reduced-motion switch: the site's own `prefers-reduced-motion` styles are turned on (CSSOM, cross-origin sheets,
  `<link media>`, `<source media>`, `matchMedia`).
- Deep coverage of shadow roots (including declarative shadow DOM and `adoptedStyleSheets` rewrites) and every frame.
- Library adapters: Web Animations, SVG SMIL, `<marquee>`, AOS / WOW / SAL, GSAP, Lottie, Swiper, Slick, Owl, Flickity.
- Scroll guard: no smooth scrolling, instant scroll functions, wheel-hijack bypass detected per wheel burst, and
  parallax freeze in Vestibular mode.
- Media guard: video autoplay is blocked without a user gesture; animated images use the browser's own policy.
- Panic freeze (`Alt+Shift+S`): a still picture of the page covers it, everything underneath stops, and every embedded
  frame follows the top frame.
- Sensory Load Index with published weights, shown as the page was built next to the page as it is now.
- Flash Guard (Chrome): local WCAG 2.3.1 flash detection on a tab-capture stream, with a Restore that reaches every
  frame.
- Three modes (Vestibular, Photosensitive, Focus), per-feature overrides, excluded sites, settings export and import.
- Evidence bench: Playwright recordings, IRIS flash analysis, motion energy, timing cost, SLI validity and an
  automated breakage pass, all reproducible with `npm run bench` and `npm run bench:breakage`.
- Unit tests (Vitest), end-to-end tests (Playwright, 18), GitHub Actions CI with store-ready zips as artifacts.

[1.0.0]: https://github.com/AttSee/sukoon/releases/tag/v1.0.0
