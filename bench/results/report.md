# Sukoon evidence report

Generated 2026-09-25T16:50:51.670Z from recordings made 2026-09-25T16:44:19.421Z.
Scenario: 1280×720, 15 s per run (4 s still, scripted wheel scrolling, 3 s still), bundled Chromium, each site
recorded once without and once with Sukoon (Vestibular mode). Reproduce with `npm run bench`.

## Summary

| Measure | Result |
| --- | --- |
| Sites with both runs analysed | 22 of 22 |
| Median change in motion while idle (motion nobody asked for) | -99% |
| Median change in motion while scrolling | -7% |
| Sites with IRIS flash failures | 1 without Sukoon → 0 with Sukoon |
| Median DOMContentLoaded cost | 312 ms |
| Median LCP cost | -36 ms |
| SLI (as built) vs. measured idle motion without Sukoon, Spearman ρ | 0.62 (n = 22) |
| Breakage rate | 2 of 21 checked sites (10%) |

## Per site

| Site | Idle motion off | on | Change | Scroll motion off | on | IRIS fail frames off | on | DCL ms off | on | LCP ms off | on | SLI as built | SLI with Sukoon |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| test-page | 0.818 | 0.004 | -99% | 2.538 | 2.719 | 0 | 0 | 159 | 84 | 220 | 180 | 38 | 0 |
| test-page-css-flash | 18.751 | 0.003 | -100% | 18.756 | 0.000 | 564 | 0 | 54 | 105 | 164 | 132 | 71 | 0 |
| lenis | 1.674 | 0.007 | -100% | 7.423 | 1.131 | 0 | 0 | 2247 | 1317 | 2256 | 1432 | 15 | 0 |
| gsap | 0.139 | 0.001 | -99% | 6.589 | 3.838 | 0 | 0 | 3703 | 6112 | 6428 | 6192 | 45 | 0 |
| apple-iphone | 3.341 | 0.001 | -100% | 4.507 | 7.522 | 0 | 0 | 4030 | 2525 | 4472 | 3456 | 35 | 0 |
| stripe | 2.127 | 0.018 | -99% | 7.996 | 9.092 | 0 | 0 | 2785 | 5456 | 2192 | 3676 | 6 | 0 |
| linear | 0.818 | 0.000 | -100% | 2.271 | 2.796 | 0 | 0 | 1201 | 1276 | 3628 | 3504 | 4 | 0 |
| vercel | 0.000 | 0.001 | +133% | 2.460 | 2.196 | 0 | 0 | 2695 | 3112 | 2704 | 3116 | 0 | 0 |
| awwwards | 0.001 | 0.001 | +0% | 2.025 | 2.127 | 0 | 0 | 8202 | 6887 | 8652 | 7324 | 0 | 0 |
| framer | 0.623 | 0.386 | -38% | 3.916 | 1.561 | 0 | 0 | 568 | 1136 | 792 | 888 | 50 | 0 |
| webflow | 0.162 | 0.001 | -100% | 6.872 | 5.402 | 0 | 0 | 6349 | 13013 | 3860 | 5664 | 21 | 3 |
| locomotive | 1.039 | 2.009 | +93% | 7.258 | 4.501 | 0 | 0 | 1738 | 3167 | 1340 | 300 | 25 | 0 |
| lottiefiles | 0.045 | 0.088 | +95% | 1.059 | 0.897 | 0 | 0 | 560 | 671 | 881 | 1081 | 0 | 0 |
| swiper | 0.008 | 0.008 | +0% | 5.724 | 4.715 | 0 | 0 | 1477 | 1684 | 1316 | 1236 | 0 | 0 |
| tesla | 0.000 | 0.000 | +0% | 0.657 | 0.670 | 0 | 0 | 424 | 433 | 436 | 448 | 0 | 0 |
| nike | 1.411 | 0.000 | -100% | 0.000 | 0.522 | 0 | 0 | 3720 | 3647 | 5844 | 5140 | 0 | 0 |
| airbnb | 0.054 | 0.001 | -99% | 1.530 | 1.486 | 0 | 0 | 4429 | 4991 | 7964 | 5016 | 0 | 0 |
| bbc-news | 0.001 | 0.411 | +82020% | 8.712 | 7.354 | 0 | 0 | 5880 | 6441 | 1988 | 2604 | 0 | 0 |
| the-verge | 0.073 | 0.000 | -100% | 6.919 | 7.312 | 0 | 0 | 2738 | 9371 | 1840 | 2368 | 0 | 0 |
| github | 0.301 | 0.073 | -76% | 3.943 | 4.756 | 0 | 0 | 3545 | 7352 | 1660 | 1844 | 18 | 0 |
| mdn | 0.040 | 0.001 | -99% | 4.703 | 4.065 | 0 | 0 | 951 | 913 | 2572 | 1700 | 0 | 0 |
| wikipedia | 1.056 | 0.002 | -100% | 3.866 | 4.127 | 0 | 0 | 1222 | 11664 | 1240 | 16656 | 0 | 0 |

## How to read this

- **Idle motion**: mean absolute luminance difference between consecutive frames at 160×90 (0–255 scale; per-pixel
  changes under 4 are treated as video-codec noise), during the
  4 s before scrolling and the 3 s after it. Nothing the user does moves the screen then, so this is motion nobody
  asked for (including smooth-scroll inertia after the wheel stops).
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
