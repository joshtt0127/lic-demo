/**
 * Icônes de l'app, fabriquées depuis la marque — pas des PNG tombés du ciel.
 *
 * `public/logo-mark.svg` est la source unique : si la marque bouge, on relance
 * `node scripts/icons.mjs` et tout suit. Trois tailles, deux usages :
 *   · 192 / 512  — icône Android et écran de démarrage ;
 *   · 512 maskable — la marque à 62 % au centre, parce qu'Android recadre en
 *     cercle ou en goutte selon le lanceur ;
 *   · 180 apple-touch — iOS ne gère pas la transparence, d'où le fond plein.
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const mark = await fs.readFile(path.join(root, 'public/logo-mark.svg'), 'utf8')
const out = path.join(root, 'public/icons')
await fs.mkdir(out, { recursive: true })

/** `inset` = part de l'icône laissée vide autour de la marque. */
function page(size, inset, background) {
  return `<!doctype html><meta charset="utf-8">
<style>
  html,body { margin:0; padding:0; }
  body { width:${size}px; height:${size}px; background:${background};
         display:flex; align-items:center; justify-content:center; }
  svg { width:${Math.round(size * (1 - inset * 2))}px; height:auto; display:block; }
</style>${mark}`
}

const browser = await chromium.launch()
const targets = [
  { file: 'icon-192.png', size: 192, inset: 0.14, background: '#FFFFFF' },
  { file: 'icon-512.png', size: 512, inset: 0.14, background: '#FFFFFF' },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.19, background: '#FFFFFF' },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.13, background: '#FFFFFF' },
]

for (const { file, size, inset, background } of targets) {
  const tab = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await tab.setContent(page(size, inset, background))
  await tab.screenshot({ path: path.join(out, file), omitBackground: false })
  await tab.close()
  console.log(`· public/icons/${file}  ${size}×${size}`)
}
await browser.close()
