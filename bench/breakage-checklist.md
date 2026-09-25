# Breakage checklist

Fill one row per site in `bench/breakage.csv` after loading it **with** Sukoon (Vestibular mode),
side by side with a window **without** it. Answer `yes` / `no` for each column.

| Column | Question |
| --- | --- |
| `content_missing` | Is any text, image or section visible without Sukoon but missing or invisible with it? |
| `interaction_broken` | Does any of these fail with Sukoon: main navigation menu, a carousel's next/previous buttons, a video's play button, a form field, scrolling to the bottom of the page? |
| `notes` | What broke, in a few words. |

A site counts as **broken** if either column is `yes`. The breakage rate in the report is broken sites ÷ checked sites.
Publish the result as it comes out.

## Automated first pass

`npm run bench:breakage` (`node bench/breakage.ts`) fills the same CSV with objective, reproducible rows
(notes prefixed `auto:`): it loads every site twice — without and with Sukoon — under one script and compares

| Signal | Broken when |
| --- | --- |
| Visible text length | with Sukoon < 90% of without, and the loss exceeds 200 characters |
| Visible images | without Sukoon has ≥ 5 and with Sukoon < 80% of them |
| Scroll to bottom | works without Sukoon, fails with it |
| Form-field focus | works without Sukoon, fails with it |
| Main navigation present | present without Sukoon, missing with it |

Limits: live sites differ slightly between any two loads (hence the noise floors); carousel buttons and video play
buttons are not exercised automatically; sites whose content differs by design (`randomContent` in `bench/sites.json`,
e.g. a random Wikipedia article) are skipped instead of guessed. Rows are merged by site: a manual verdict for one
site survives an automated pass over the others, but re-running the pass for a site replaces its row.

The CSV is written after every site, so an interrupted run keeps what it finished, and a page that never answers is
abandoned after 150 s and reported as a failed load (`auto: load failed (watchdog …)`), not guessed.

"Visible" means visible to a person: a rendered box, and neither the element nor any ancestor hidden or faded out.
One known source of `content_missing` verdicts is lazy loading inside self-advancing components (auto-rotating tabs,
customer-story carousels, sliders): with Sukoon the rotation stops, so images in panels that were never shown are never
requested. A person can still open those panels by hand; the automated pass cannot, so it reports the loss and leaves
the judgement to the manual review.
