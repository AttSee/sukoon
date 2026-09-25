# Sukoon privacy policy

Sukoon runs entirely on your device.

- **No servers, no accounts, no analytics, no telemetry.** Sukoon never sends anything about you, your browsing or
  your settings anywhere.
- **Settings** (mode, protections, excluded sites) are kept in the browser's local extension storage on this device
  only. You can export, import or reset them from the settings page.
- **The only network requests** Sukoon makes re-read stylesheets that the current page has already loaded, so that the
  page's own reduced-motion styles can be applied. These requests carry no cookies, and only responses served as
  `text/css` are used.
- **Panic freeze** takes a screenshot of the current tab to cover it with a still picture. The screenshot stays in the
  page's memory and is discarded when the freeze is released.
- **Flash Guard** (Chrome only, started by you) analyses the tab's video frames inside the extension's own offscreen
  document. Frames are downsampled and discarded immediately; nothing is stored or transmitted.
- **Permissions** are listed and explained in the [README](README.md#permissions).

Sukoon is not a medical device. It reduces exposure to common motion and flash triggers and cannot guarantee
protection from seizures, migraines, dizziness or any other symptom.

Questions or concerns: open an issue in the project repository.
