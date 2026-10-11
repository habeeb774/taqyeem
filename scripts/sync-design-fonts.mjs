import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const families = {
  Alexandria: [300, 400, 500, 600, 700, 800],
  Cairo: [300, 400, 500, 600, 700, 800],
  Tajawal: [300, 400, 500, 700, 800],
  'IBM Plex Sans Arabic': [300, 400, 500, 600, 700],
  'Noto Kufi Arabic': [300, 400, 500, 600, 700],
  'Noto Naskh Arabic': [400, 500, 600, 700],
};
const directory = new URL('../public/fonts/design/', import.meta.url);
await mkdir(directory, { recursive: true });
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font download failed: ${response.status}`);
  return response;
}
for (const [family, weights] of Object.entries(families)) {
  const slug = family.toLowerCase().replaceAll(' ', '-');
  const query = `${family.replaceAll(' ', '+')}:wght@${weights.join(';')}`;
  let css = await (await download(`https://fonts.googleapis.com/css2?family=${query}&display=swap`)).text();
  for (const match of new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)\s]+/g))) {
    const bytes = Buffer.from(await (await download(match)).arrayBuffer());
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const filename = `${slug}-${hash}.ttf`;
    await writeFile(new URL(filename, directory), bytes);
    css = css.replaceAll(match, `/fonts/design/${filename}`);
  }
  await writeFile(new URL(`${slug}.css`, directory), css);
  const licenseName = family.toLowerCase().replaceAll(' ', '');
  const license = await download(`https://raw.githubusercontent.com/google/fonts/main/ofl/${licenseName}/OFL.txt`);
  const licenseText = (await license.text()).split('\n').map(line => line.trimEnd()).join('\n');
  await writeFile(new URL(`${slug}-LICENSE.txt`, directory), licenseText);
}
