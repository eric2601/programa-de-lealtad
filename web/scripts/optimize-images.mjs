// Genera las imágenes ligeras (WebP) que usan la web y la app del cliente a partir de los
// originales en docs/arte-original/. Uso: npm run images -w web
//
// Los PNG originales pesan ~1 MB cada uno; en WebP quedan en una fracción sin perder calidad
// visible. Si cambias un cartel, reemplaza el PNG en docs/arte-original/promos y vuelve a correrlo.
import { mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = join(root, 'docs', 'arte-original', 'promos');
const webOut = join(root, 'web', 'public', 'promos');
const androidOut = join(root, 'android', 'cliente', 'src', 'main', 'res', 'drawable-nodpi');

if (!existsSync(src)) {
  console.error(`No existe ${src}`);
  process.exit(1);
}
mkdirSync(webOut, { recursive: true });

let before = 0;
let after = 0;
for (const file of readdirSync(src).filter((f) => f.endsWith('.png'))) {
  const name = basename(file, '.png');
  const input = sharp(join(src, file));
  const meta = await input.metadata();
  // Nada se muestra a más de ~900 px; más resolución solo pesa.
  const resized = input.resize({ width: Math.min(meta.width ?? 900, 900), withoutEnlargement: true });
  const web = await resized.clone().webp({ quality: 80, effort: 6 }).toFile(join(webOut, `${name}.webp`));
  // Android no acepta guiones en recursos: promo-01 → promo_01
  const android = await resized.clone().webp({ quality: 80, effort: 6 }).toFile(join(androidOut, `${name.replace(/-/g, '_')}.webp`));
  const { size } = statSync(join(src, file));
  before += size;
  after += web.size;
  console.log(`${name}: ${(size / 1024).toFixed(0)} KB → ${(web.size / 1024).toFixed(0)} KB (Android ${(android.size / 1024).toFixed(0)} KB)`);
}
console.log(`Total: ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB`);
