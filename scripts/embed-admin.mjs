import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const adminDir = join(root, 'src', 'admin');
const indexPath = join(adminDir, 'index.html');
const scriptPath = join(adminDir, 'script.js');
const stylePath = join(adminDir, 'style.css');
const bundlePath = join(root, 'public', 'admin.html');

const [html, script, style] = await Promise.all([
  readFile(indexPath, 'utf8'),
  readFile(scriptPath, 'utf8'),
  readFile(stylePath, 'utf8')
]);

const embedded = html
  .replace('<!-- INLINE_STYLE -->', `<style>\n${style}\n</style>`)
  .replace('<!-- INLINE_SCRIPT -->', `<script type="module">\n${script}\n</script>`);

await writeFile(bundlePath, embedded);
console.log(`Admin bundle written to ${bundlePath}`);
