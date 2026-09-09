/* Bundle the game into single self-contained files.
 *
 *   dist/sprigs.html    a standalone page you can double-click or email
 *   dist/artifact.html  the same page as a fragment, for hosts that supply
 *                       their own <head> and <body> wrapper
 *
 * The sources are plain scripts sharing a global, so bundling is honest
 * concatenation in load order - no module graph, no transform, no surprises. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const html = read('index.html');
const css = read('styles.css');

/* Take the script order from index.html itself, so the two can never drift. */
const sources = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
if (!sources.length) throw new Error('no <script src> tags found in index.html');
const js = sources.map((s) => `/* ===== ${s} ===== */\n${read(s)}`).join('\n');

/* The page body, with its external references replaced by the real thing. */
const body = html
  .replace(/[\s\S]*<body>/, '')
  .replace(/<\/body>[\s\S]*/, '')
  .replace(/\s*<script src="[^"]+"><\/script>/g, '')
  .trim();

const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'Sprigs'])[1];

/* Google Fonts is the one external stylesheet host artifact hosting admits, so
 * the <link> tags travel with the bundle rather than being inlined. */
const fontLinks = [...html.matchAll(/<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g)]
  .map((m) => m[0]).join('\n');

/* Closing tags inside string literals would end the script element early. */
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const head = `<title>${title}</title>\n${fontLinks}\n<style>\n${css}\n</style>`;
const tail = `<script>\n${safeJs}\n</script>`;

mkdirSync(resolve(root, 'dist'), { recursive: true });

writeFileSync(resolve(root, 'dist/sprigs.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n` +
  `${head}\n</head>\n<body>\n${body}\n${tail}\n</body>\n</html>\n`);

writeFileSync(resolve(root, 'dist/artifact.html'), `${head}\n${body}\n${tail}\n`);

const kb = (p) => (readFileSync(resolve(root, p)).length / 1024).toFixed(0);
console.log(`built dist/sprigs.html (${kb('dist/sprigs.html')} kB) and dist/artifact.html (${kb('dist/artifact.html')} kB)`);
