/** Stage validated production builds for both browsers in a visible release folder. */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
const out = join(root, '.output');
const release = join(root, 'release');
const builds = [
  { name: 'chrome', dir: 'chrome-mv3' },
  { name: 'firefox', dir: 'firefox-mv3' },
];
const archives = builds.map(({ name }) => `sukoon-${version}-${name}.zip`);
archives.push(`sukoon-${version}-sources.zip`);

// Validate everything before replacing the last usable release.
for (const { dir } of builds) {
  const build = join(out, dir);
  const manifest = JSON.parse(readFileSync(join(build, 'manifest.json'), 'utf8'));
  if (manifest.version !== version || manifest.manifest_version !== 3 || manifest.content_security_policy?.extension_pages?.includes('localhost')) {
    throw new Error(`Invalid production manifest: ${dir}`);
  }
  for (const file of ['background.js', 'calm.js', 'calm.css', 'main-world.js', 'popup.html', 'options.html']) {
    if (!existsSync(join(build, file))) throw new Error(`Missing production file: ${dir}/${file}`);
  }
}
for (const archive of archives) {
  if (!existsSync(join(out, archive))) throw new Error(`Missing archive: ${archive}. Run npm run zip first.`);
}

mkdirSync(release, { recursive: true });
for (const { name, dir } of builds) {
  const destination = join(release, name);
  rmSync(destination, { recursive: true, force: true });
  cpSync(join(out, dir), destination, { recursive: true });
}
for (const archive of archives) cpSync(join(out, archive), join(release, archive));
writeFileSync(join(release, 'SHA256SUMS'), archives.map((archive) =>
  `${createHash('sha256').update(readFileSync(join(release, archive))).digest('hex')}  ${archive}`,
).join('\n') + '\n');

writeFileSync(join(release, 'README.txt'), `Sukoon ${version} — production builds

Chrome / Brave / Edge:
  1. Open chrome://extensions (Brave: brave://extensions, Edge: edge://extensions).
  2. Enable Developer mode.
  3. Load unpacked → choose the chrome folder beside this file.
  4. If Sukoon is already installed from this folder, press Reload.
  5. Reload existing website tabs.

Firefox 140+:
  1. Open about:debugging#/runtime/this-firefox.
  2. Load Temporary Add-on → choose firefox/manifest.json beside this file.
  3. Open Sukoon settings → Allow on all sites.
  4. Reload existing website tabs. Temporary add-ons last until Firefox quits.

The browser archives are for store submission; the sources archive is for Firefox review.
SHA256SUMS contains the checksums of the archives from this build.
`);

console.log(`Sukoon ${version} production builds: ${release}
Chrome / Brave / Edge: load unpacked from ${join(release, 'chrome')}
Firefox 140+: load ${join(release, 'firefox/manifest.json')}
Installation instructions: ${join(release, 'README.txt')}
Archives: ${archives.join(', ')}`);
