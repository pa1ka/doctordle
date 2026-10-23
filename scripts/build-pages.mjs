import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

// A dependency-free static build; the Worker/D1 source remains available separately.
const output = new URL('../out/', import.meta.url);
const source = new URL('../game/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
function replaceRequired(text, before, after) {
  if (!text.includes(before)) throw new Error(`Static build source changed: ${before}`);
  return text.replace(before, after);
}
let html = await readFile(new URL('index.html', output), 'utf8');
html = html.replace(/(href|src)="\//g, '$1="./');
await writeFile(new URL('index.html', output), html);
let app = await readFile(new URL('app.js', output), 'utf8');
app = replaceRequired(app, 'new URL(location.origin)', 'new URL(location.pathname, location.origin)');
app = app.replaceAll("location.assign('/')", "location.assign('./')");
await writeFile(new URL('app.js', output), app);
await rm(new URL('rooms.js', output));
await writeFile(new URL('.nojekyll', output), '');
console.log('GitHub Pages static build ready in out/');
