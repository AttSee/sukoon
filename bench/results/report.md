# Sukoon evidence report

Generated 2026-09-26T09:02:48.838Z from recordings made 2026-09-26T08:50:20.377Z.
Scenario: 1280×720, 15 s per run (4 s still, scripted wheel scrolling, 3 s still), bundled Chromium, each site
recorded once without and once with Sukoon (Vestibular mode). Reproduce with `npm run bench`.

## Summary

| Measure | Result |
| --- | --- |
| Sites with both runs analysed | 22 of 22 |
| Recordings whose phase windows were located by on-screen markers | 39 of 44 |
| Median change in motion while idle (motion nobody asked for) | -71% |
| Median change in motion while scrolling | -15% |
| Sites with IRIS flash failures | 1 without Sukoon → 0 with Sukoon |
| Median DOMContentLoaded cost | -85 ms |
| Median LCP cost | -204 ms |
| SLI (as built) vs. measured idle motion without Sukoon, Spearman ρ | 0.69 (n = 22) |
| Breakage rate | 0 of 21 checked sites (0%) |

## Per site

| Site | Idle motion off | on | Change | Scroll motion off | on | IRIS fail frames off | on | DCL ms off | on | LCP ms off | on | SLI as built | SLI with Sukoon |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| test-page | 0.845 | 0.000 | -100% | 2.578 | 1.787 | 0 | 0 | 112 | 106 | 208 | 136 | 52 | 0 |
| test-page-css-flash | 18.281 | 0.000 | -100% | 18.197 | 0.000 | 602 | 0 | 142 | 74 | 268 | 88 | 71 | 0 |
| lenis | 1.561 | 0.708 | -55% | 7.343 | 1.167 | 0 | 0 | 916 | 1148 | 1072 | 1272 | 16 | 0 |
| gsap | 0.990 | 0.001 | -100% | 6.614 | 3.837 | 0 | 0 | 2871 | 2265 | 5604 | 2348 | 45 | 0 |
| apple-iphone | 0.077 | 0.001 | -99% | 5.609 | 6.868 | 0 | 0 | 1875 | 1448 | 2884 | 2540 | 35 | 0 |
| stripe | 0.068 | 0.007 | -90% | 8.652 | 8.203 | 0 | 0 | 1876 | 1724 | 1416 | 1128 | 6 | 0 |
| linear | 0.047 | 0.000 | -99% | 2.554 | 2.491 | 0 | 0 | 1224 | 921 | 3412 | 1872 | 19 | 0 |
| vercel | 0.001 | 0.302 | +37638% | 2.365 | 1.752 | 0 | 0 | 923 | 777 | 928 | 796 | 0 | 0 |
| awwwards | 0.001 | 0.001 | -30% | 2.349 | 2.189 | 0 | 0 | 4381 | 3190 | 4408 | 3076 | 3 | 0 |
| framer | 0.369 | 0.000 | -100% | 3.681 | 1.751 | 0 | 0 | 872 | 724 | 896 | 792 | 50 | 0 |
| webflow | 0.154 | 0.001 | -100% | 6.405 | 5.008 | 0 | 0 | 2901 | 2965 | 2120 | 1872 | 21 | 0 |
| locomotive | 1.978 | 1.776 | -10% | 7.114 | 3.904 | 0 | 0 | 2230 | 1235 | 1476 | 388 | 25 | 0 |
| lottiefiles | 0.002 | 0.002 | -4% | 1.094 | 0.900 | 0 | 0 | 337 | 327 | 625 | 630 | 0 | 0 |
| swiper | 0.001 | 0.008 | +1000% | 5.468 | 4.617 | 0 | 0 | 799 | 658 | 700 | 452 | 0 | 0 |
| tesla | 0.000 | 0.000 | — | 0.651 | 0.672 | 0 | 0 | 471 | 370 | 496 | 400 | 0 | 0 |
| nike | 0.000 | 0.001 | +233% | 0.607 | 0.574 | 0 | 0 | 1971 | 2222 | 3716 | 3156 | 0 | 0 |
| airbnb | 0.000 | 0.001 | +75% | 1.637 | 1.371 | 0 | 0 | 1514 | 1502 | 3848 | 2372 | 23 | 0 |
| bbc-news | 0.052 | 0.015 | -71% | 8.754 | 7.436 | 0 | 0 | 1722 | 1560 | 1432 | 1204 | 0 | 0 |
| the-verge | 0.063 | 0.037 | -41% | 7.393 | 6.556 | 0 | 0 | 1333 | 1796 | 1480 | 1760 | 0 | 0 |
| github | 0.207 | 0.007 | -96% | 4.220 | 4.936 | 0 | 0 | 1742 | 1688 | 1316 | 1144 | 20 | 0 |
| mdn | 0.337 | 0.000 | -100% | 5.015 | 4.359 | 0 | 0 | 587 | 681 | 1252 | 1380 | 0 | 0 |
| wikipedia | 0.001 | 0.001 | +11% | 4.723 | 4.163 | 0 | 0 | 1378 | 1405 | 1400 | 1732 | 0 | 0 |

## How to read this

- **Idle motion**: mean absolute luminance difference between consecutive frames at 160×90 (0–255 scale; per-pixel
  changes under 4 are treated as video-codec noise), during the
  4 s before scrolling and the 3 s after it. Nothing the user does moves the screen then, so this is motion nobody
  asked for (including smooth-scroll inertia after the wheel stops). The windows are located by markers the
  script shows on screen at every boundary (a 128 px two-tone square in the top-left corner for 160 ms; the frames
  on which it appears or vanishes are left out), because the recording's timeline is offset from the wall clock: it
  starts at the first captured frame, up to 1.6 s after the page was created on heavy sites, and frames only arrive
  when the page repaints. A recording without markers falls back to wall-clock windows.
- **Scroll motion**: the same measure while the wheel is turning. It includes the scrolling itself, so it never
  reaches zero, and native scrolling can move further than a hijacked one; read it as context, not as a score.
- **IRIS fail frames**: frames that EA's IRIS (Python port `iris-pse-detection`) marks as luminance or red flash
  failures under WCAG 2.3.1 / ISO 9241-391. IRIS judges the change in whole-frame average luminance with a 25% area
  rule, so it only fails large flashes; Sukoon's own Flash Guard uses the stricter 10° visual-field limit. IRIS output
  is informational and not a certification.
- **DCL / LCP**: single runs on a live network, so they are noisy; read the medians, not single rows.
- **SLI**: Sukoon's own index. "As built" comes from a separate measure-only pass (extension loaded, every
  protection off), so it sees the page exactly as its authors shipped it. Its credibility comes from the ρ above, not
  from Sukoon's claims.
- Live sites change daily; numbers will drift between runs. Publish the run you used.
