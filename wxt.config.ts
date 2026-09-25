import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { calmCss, DOCUMENT_SCOPE } from './src/shared/calm-css';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  imports: false,
  zip: {
    // Source archive for Firefox review: code only, no recordings or local environments.
    excludeSources: ['bench/results/**', 'bench/.venv/**', 'test-results/**', 'playwright-report/**', 'docs/**'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  hooks: {
    // calm.css is generated from a single TypeScript source so that the
    // document-level stylesheet and the shadow-root stylesheet never drift.
    'build:publicAssets': (_wxt, files) => {
      files.push({ relativeDest: 'calm.css', contents: calmCss(DOCUMENT_SCOPE) });
    },
  },
  manifest: ({ browser }) => {
    const chrome = browser !== 'firefox';
    return {
      name: 'Sukoon — Calm the Web',
      short_name: 'Sukoon',
      description:
        'Calms motion, flashing and hijacked scrolling on any website. Open source, fully local, no servers.',
      permissions: [
        'storage',
        'scripting',
        'activeTab',
        'contextMenus',
        ...(chrome
          ? ['accessibilityFeatures.read', 'accessibilityFeatures.modify', 'tabCapture', 'offscreen']
          : ['browserSettings']),
      ],
      host_permissions: ['<all_urls>'],
      commands: {
        panic: {
          suggested_key: { default: 'Alt+Shift+S' },
          description: 'Freeze the page instantly (press again to release)',
        },
        toggle: {
          suggested_key: { default: 'Alt+Shift+P' },
          description: 'Turn Sukoon off / on everywhere',
        },
      },
      action: { default_title: 'Sukoon' },
      ...(chrome
        ? {}
        : {
            browser_specific_settings: {
              gecko: {
                id: 'sukoon@sukoon.dev',
                // 128 brought `world: 'MAIN'` to the scripting API; 140 (an ESR) is the first release that
                // understands `data_collection_permissions`, so the "collects nothing" disclosure is shown everywhere.
                strict_min_version: '140.0',
                // Sukoon collects nothing.
                data_collection_permissions: { required: ['none'] },
              },
            },
          }),
    };
  },
});
