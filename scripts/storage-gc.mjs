/**
 * Ramasse-miettes du stockage.
 *
 *   node scripts/storage-gc.mjs          liste ce qui serait supprimé
 *   node scripts/storage-gc.mjs --delete supprime
 *
 * Un objet du stockage n'est atteignable par l'application que si une ligne de
 * `media_assets` pointe dessus : c'est elle qui porte le propriétaire, et c'est
 * par elle que passent les URL signées. Un fichier sans sa ligne est donc
 * invisible de tout le monde — il occupe de la place et ne sert plus à rien.
 *
 * Ça arrive quand un test échoue avant son propre nettoyage, ou quand un compte
 * est supprimé : la ligne part en cascade, le fichier reste. 427 tapes
 * fantômes s'étaient accumulées comme ça.
 *
 * Volontairement **en lecture seule par défaut**. Supprimer des fichiers ne se
 * fait pas par surprise au détour d'un script lancé pour voir.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
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

const doDelete = process.argv.includes('--delete')
const BUCKETS = ['selftapes', 'media', 'avatars']

/** Les chemins que la base connaît, donc ceux qu'il faut garder. */
const known = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await admin
    .from('media_assets')
    .select('bucket, path')
    .range(from, from + 999)
  if (error) throw error
  for (const row of data) known.add(`${row.bucket}/${row.path}`)
  if (data.length < 1000) break
}

/**
 * `media_assets` ne suffit pas.
 *
 * Trois colonnes portent une **URL publique** au lieu d'une référence :
 * l'affiche d'un projet, l'avatar d'un compte, la couverture d'un profil. Les
 * fichiers du jeu de démonstration ont été posés directement dans le bucket et
 * n'ont jamais eu de ligne dans `media_assets` — pour la GC, ils ressemblaient
 * trait pour trait à des orphelins. Une première passe en lecture seule les
 * aurait supprimés : l'affiche d'Evermore et sept avatars de la démo.
 *
 * On extrait donc le chemin de chaque URL et on le déclare connu. C'est aussi
 * la raison pour laquelle ce script refuse de supprimer par défaut.
 */
const urlColumns = [
  ['projects', 'poster_url'],
  ['profiles', 'avatar_url'],
  ['talent_profiles', 'cover_url'],
]
for (const [table, column] of urlColumns) {
  const { data, error } = await admin.from(table).select(column).not(column, 'is', null)
  if (error) throw error
  for (const row of data) {
    // …/storage/v1/object/public/<bucket>/<chemin>  ·  …/object/sign/<bucket>/<chemin>
    const match = String(row[column]).match(/\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/)
    if (match) known.add(`${match[1]}/${decodeURIComponent(match[2])}`)
  }
}

let total = 0
let bytes = 0
for (const bucket of BUCKETS) {
  // Les tapes sont rangées par propriétaire : il faut descendre d'un niveau.
  const { data: folders } = await admin.storage.from(bucket).list('', { limit: 1000 })
  const orphans = []
  for (const folder of folders ?? []) {
    if (folder.id !== null) {
      if (!known.has(`${bucket}/${folder.name}`)) orphans.push(folder)
      continue
    }
    const { data: files } = await admin.storage.from(bucket).list(folder.name, { limit: 1000 })
    for (const file of files ?? []) {
      const key = `${folder.name}/${file.name}`
      if (!known.has(`${bucket}/${key}`)) orphans.push({ ...file, name: key })
    }
  }

  const size = orphans.reduce((sum, file) => sum + (file.metadata?.size ?? 0), 0)
  total += orphans.length
  bytes += size
  console.log(`${bucket.padEnd(10)} ${String(orphans.length).padStart(4)} orphelin(s)  ${(size / 1e6).toFixed(1)} MB`)

  if (doDelete && orphans.length > 0) {
    for (let i = 0; i < orphans.length; i += 100) {
      const batch = orphans.slice(i, i + 100).map((file) => file.name)
      const { error } = await admin.storage.from(bucket).remove(batch)
      if (error) console.error(`  ✖ ${bucket}: ${error.message}`)
    }
  }
}

console.log(
  `\n${total} fichier(s), ${(bytes / 1e6).toFixed(1)} MB — ` +
    (doDelete ? 'supprimés.' : 'relancer avec --delete pour supprimer.'),
)
