# Changelog

All notable changes to Sukoon are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/),
and the project uses [Semantic Versioning](https://semver.org/).

Development versions are 0.x. The first git tag was named v1.0.0; store listings and local packs from this release
onwards use 0.4.0.

## [Unreleased]

### Fixed

- End-to-end tests use a dedicated fixture port and refuse to reuse an unrelated local server. The cross-origin
  stylesheet fixture follows the chosen port. Scroll tests count real input separately from synthetic detection probes.
- Flash Guard acknowledges startup only after tab capture and the analyser initialize. Failed or cancelled captures
  release their tracks, and a failed startup closes the offscreen document instead of displaying a running guard.
- Imported settings discard unknown and non-boolean feature overrides, preserving valid mode defaults.
- A failed settings read no longer prevents subsequent background settings synchronizations.

### Changed

- Refresh compatible dependencies and lockfile.
- Production packaging stages both Chrome and Firefox builds and all archives in `release/`, validates required
  build files and manifest versions, and writes installation instructions plus SHA-256 archive checksums.

## [0.4.0] - 2026-09-26

### Added

- English remains the default language. Arabic is an explicit second choice (RTL) in the popup, settings, welcome
  screen, panic freeze, Flash Guard banner and context menus. The locale is stored with the other settings.
- Calm digest: short sentences built from the same observations as the Sensory Load Index, shown at the top of the
  popup and as an optional on-page chip (briefly / pinned / off). This is what Sukoon did on this page, not a new score.
- Live-site smoke (`LIVE=1 npx playwright test e2e/live-sites.spec.ts`) against Lenis, Locomotive, Apple iPhone, GSAP,
  Stripe and Swiper.
- `npm run pack` writes the production Chrome and Firefox builds plus store zips, copies Chrome into `release/chrome`,
  and prints the folders to load.

### Fixed

- Scroll guard: smooth-scroll inertia leaked through whenever a canvas, video or SVG was under the cursor, because the
  wheel exemption for maps, charts and sliders also let the wheel reach the page-wide hijacker. On locomotive.ca the page
  kept gliding for about a second after the wheel stopped; it now stops at once, as on Lenis. The wheel still reaches the
  widget under the cursor and is stopped on its way back up, before a hijacker listening on `window`. Covered by a new
  end-to-end test with a decorative canvas and a canvas widget under an active hijacker.
- Evidence bench: the idle-motion windows were placed on the recording by wall-clock time, but a Playwright recording
  starts at its first captured frame (up to 1.6 s after the page was created, measured on stripe.com) and frames only
  arrive when the page repaints, so the first second of scrolling leaked into the "idle before" window and the
  scrollback after the scenario into the "idle after" one. The script now marks every phase boundary on screen and the
  analysis locates the windows from those changes.
- Evidence report: the median change in idle motion is now taken over the sites that actually move while idle without
  Sukoon (idle motion of 0.05 or more on the 0–255 scale).
- Breakage bench: a break must now reproduce on a second pair of loads before it is reported.

### Documentation

- Known trade-offs now say that canvas and WebGL scenes keep moving unless the site honours `prefers-reduced-motion`,
  with Stripe's gradient (stops) and the Lenis homepage (keeps drifting) as measured examples.

## [1.0.0] - 2026-09-26

First tagged release (premature 1.x number). Kept here for the existing git tag.

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
- Unit tests (Vitest), end-to-end tests (Playwright), GitHub Actions CI with store-ready zips as artifacts.

[0.4.0]: https://github.com/AttSee/sukoon/releases/tag/v0.4.0
[1.0.0]: https://github.com/AttSee/sukoon/releases/tag/v1.0.0
