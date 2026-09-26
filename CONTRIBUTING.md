# Contributing to Sukoon

Thank you for helping calm the web. Two rules shape every change:

1. **No medical claims.** Sukoon reduces exposure to motion and flash triggers; it never promises protection from
   seizures or symptoms, in code, copy or docs.
2. **Finish, don't cancel.** Motion jumps to its end state; content that animates in must never stay hidden.

## Development loop

```bash
npm install
npm run dev              # Chrome, with hot reload (WXT)
npm run check            # typecheck + unit tests + both builds
npm run test:e2e         # Playwright against the built extension and the test page
npm run test-page        # http://127.0.0.1:4173/ — every module has a section there
```

Add a section to `test-page/` for any new kind of motion you handle, and an end-to-end test in `e2e/` for its
acceptance criterion. Pure logic goes in `src/shared/` with a unit test in `tests/`.

## Reporting a broken site

Use the **Site breakage** issue template. The site's URL, the mode you were in and what disappeared or stopped
working are enough; the automated breakage pass (`npm run bench:breakage`) and the manual checklist in
[`bench/breakage-checklist.md`](bench/breakage-checklist.md) are how we confirm and track it.

## Evidence

Numbers quoted anywhere must come from `npm run bench`. Publish the run you used, including the bad rows.

## Pull requests

Keep the CI green (`npm run check` and `npm run test:e2e` locally first), describe the trade-off your change makes
for real sites, and update the README module table if behaviour changes.
