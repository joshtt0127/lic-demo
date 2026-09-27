/**
 * Recompresse les images déjà en ligne.
 *
 *   node scripts/optimize-media.mjs          montre ce qui serait fait
 *   node scripts/optimize-media.mjs --apply  applique
 *
 * Le jeu de démonstration a été posé en PNG : une affiche de 7,6 Mo, des
 * avatars de 1,4 Mo affichés dans un rond de 32 px. Un PNG est fait pour les
 * aplats et la transparence, pas pour une photo — d'où le facteur ~30.
 *
 * Ce n'est pas qu'une histoire de quota : cette affiche est retéléchargée à
 * chaque ouverture d'une fiche casting, y compris par un comédien en 4G sur son
 * téléphone. La compresser, c'est d'abord une amélioration du produit.
 *
 * Le fichier change d'extension en devenant du JPEG, donc chaque référence est
 * réécrite dans la foulée : `media_assets.path`, `projects.poster_url`,
 * `profiles.avatar_url`, `talent_profiles.cover_url`. L'ancien objet n'est
 * supprimé qu'une fois le nouveau en place et les références à jour.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
)
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const apply = process.argv.includes('--apply')
/** Au-delà, c'est du gaspillage pour un écran ; en deçà, ça ne vaut pas la reprise. */
const THRESHOLD = 300_000
/** Une affiche s'affiche à ~340 px, un avatar à 40 px. 1400 et 512 couvrent le retina. */
const MAX_EDGE = { media: 1400, avatars: 512 }


const targets = []
for (const bucket of ['media', 'avatars']) {
  const { data: folders } = await admin.storage.from(bucket).list('', { limit: 1000 })
  for (const folder of folders ?? []) {
    if (folder.id !== null) continue
    const { data: files } = await admin.storage.from(bucket).list(folder.name, { limit: 1000 })
    for (const file of files ?? []) {
      const size = file.metadata?.size ?? 0
      if (size < THRESHOLD) continue
      targets.push({ bucket, key: `${folder.name}/${file.name}`, size })
    }
  }
}

let before = 0
let after = 0
for (const target of targets) {
  const { data: blob, error } = await admin.storage.from(target.bucket).download(target.key)
  if (error) {
    console.error(`  ✖ ${target.key}: ${error.message}`)
    continue
  }

  const tmpIn = path.join(os.tmpdir(), `lic-in-${path.basename(target.key)}`)
  const tmpOut = tmpIn.replace(/\.[^.]+$/, '') + '.opt.jpg'
  writeFileSync(tmpIn, Buffer.from(await blob.arrayBuffer()))
  execFileSync('sips', [
    '-Z', String(MAX_EDGE[target.bucket]),
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', '80',
    tmpIn, '--out', tmpOut,
  ], { stdio: 'ignore' })
  const optimized = readFileSync(tmpOut)

  before += target.size
  after += optimized.length
  const gain = (1 - optimized.length / target.size) * 100
  const newKey = target.key.replace(/\.[^.]+$/, '.jpg')
  console.log(
    `  ${(target.size / 1e6).toFixed(2)} MB → ${(optimized.length / 1e6).toFixed(2)} MB` +
      ` (−${gain.toFixed(0)} %)  ${target.bucket}/${newKey}`,
  )

  if (apply) {
    const { error: up } = await admin.storage
      .from(target.bucket)
      .upload(newKey, optimized, { contentType: 'image/jpeg', upsert: true })
    if (up) {
      console.error(`    ✖ upload: ${up.message}`)
    } else {
      // Les références, avant de retirer l'ancien fichier.
      await admin
        .from('media_assets')
        .update({ path: newKey, mime: 'image/jpeg', bytes: optimized.length })
        .eq('bucket', target.bucket)
        .eq('path', target.key)

      // La clé primaire n'est pas `id` partout : `talent_profiles` est indexée
      // par `profile_id`. La supposer uniforme faisait échouer silencieusement
      // le `select`, donc l'URL n'était jamais réécrite — alors que l'ancien
      // fichier, lui, était bien supprimé juste après. Une couverture de profil
      // s'est retrouvée cassée comme ça.
      for (const [table, key, column] of [
        ['projects', 'id', 'poster_url'],
        ['profiles', 'id', 'avatar_url'],
        ['talent_profiles', 'profile_id', 'cover_url'],
      ]) {
        const { data: rows, error: read } = await admin
          .from(table)
          .select(`${key}, ${column}`)
          .ilike(column, `%${target.key}%`)
        if (read) throw read // Jamais en silence : le fichier va être supprimé.
        for (const row of rows ?? []) {
          const { error: write } = await admin
            .from(table)
            .update({ [column]: String(row[column]).replace(target.key, newKey) })
            .eq(key, row[key])
          if (write) throw write
        }
      }

      if (newKey !== target.key) await admin.storage.from(target.bucket).remove([target.key])
    }
  }
  unlinkSync(tmpIn)
  unlinkSync(tmpOut)
}

console.log(
  `\n${targets.length} image(s) · ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB` +
    ` (−${((1 - after / before) * 100).toFixed(0)} %) — ` +
    (apply ? 'appliqué.' : 'relancer avec --apply.'),
)
