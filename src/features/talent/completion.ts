import type { TalentProfileFull } from '@/data/repositories/talent'

/**
 * Profile completion, computed from the loaded profile rather than stored in a
 * column — a derived value in the database drifts the moment anything is edited
 * outside the wizard.
 *
 * The weights say what casting actually needs: a headshot and casting details
 * matter more than a website.
 */

export type CompletionItem = {
  key: string
  /** Translation key — the talent app is bilingual (see `lib/i18n`). */
  label: string
  weight: number
  done: boolean
  /** Which onboarding / profile section fixes it. */
  section: 'identity' | 'professional' | 'casting' | 'skills' | 'credits' | 'media'
}

export function completionItems(data: TalentProfileFull): CompletionItem[] {
  const { profile, talent, skills, languages, credits, training, media } = data
  const has = (value: unknown) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value && String(value).trim())

  return [
    {
      key: 'name',
      label: 'completion.name',
      weight: 10,
      section: 'identity',
      done: has(profile.first_name) && has(profile.last_name),
    },
    {
      key: 'avatar',
      label: 'completion.avatar',
      weight: 12,
      section: 'identity',
      done: has(profile.avatar_url),
    },
    { key: 'location', label: 'completion.location', weight: 6, section: 'identity', done: has(profile.city) },
    {
      key: 'headline',
      label: 'completion.headline',
      weight: 10,
      section: 'professional',
      done: has(talent.headline),
    },
    { key: 'bio', label: 'completion.bio', weight: 8, section: 'professional', done: has(talent.bio) },
    {
      key: 'playing_age',
      label: 'completion.age',
      weight: 12,
      section: 'casting',
      done: talent.playing_age_min !== null && talent.playing_age_max !== null,
    },
    { key: 'gender', label: 'completion.gender', weight: 6, section: 'casting', done: has(talent.gender) },
    {
      key: 'languages',
      label: 'completion.languages',
      weight: 8,
      section: 'casting',
      done: languages.length > 0,
    },
    { key: 'skills', label: 'completion.skills', weight: 10, section: 'skills', done: skills.length >= 3 },
    {
      key: 'headshots',
      label: 'completion.headshot',
      weight: 12,
      section: 'media',
      done: media.some((asset) => asset.kind === 'headshot' || asset.kind === 'portfolio'),
    },
    {
      key: 'showreel',
      label: 'completion.reel',
      weight: 8,
      section: 'media',
      done: media.some((asset) => asset.kind === 'showreel' || asset.kind === 'selftape'),
    },
    {
      key: 'credits',
      label: 'completion.credits',
      weight: 8,
      section: 'credits',
      done: credits.length > 0 || training.length > 0,
    },
  ]
}

export type Completion = {
  percent: number
  items: CompletionItem[]
  missing: CompletionItem[]
}

export function profileCompletion(data: TalentProfileFull): Completion {
  const items = completionItems(data)
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  const earned = items.reduce((sum, item) => (item.done ? sum + item.weight : sum), 0)
  return {
    percent: Math.round((earned / total) * 100),
    items,
    missing: items.filter((item) => !item.done),
  }
}

/**
 * Ce qui manque pour candidater — la même règle que la base.
 *
 * Quatre informations, pas une de plus : une production qui reçoit un nom vide,
 * sans photo, sans âge de jeu et sans ville ne peut rien en faire, et le
 * comédien croit avoir postulé. Le reste du profil enrichit sa candidature, il
 * ne la conditionne pas.
 *
 * Le miroir côté base est `missing_for_application()` : ici on l'affiche avant
 * le clic, là-bas on le refuse pour de bon. Les deux listes doivent dire la
 * même chose — un test le vérifie de bout en bout.
 */
export type ApplicationGap = 'name' | 'photo' | 'playingAge' | 'location'

export function missingForApplication(data: TalentProfileFull): ApplicationGap[] {
  const { profile, talent, media } = data
  const filled = (value: unknown) => Boolean(value && String(value).trim())
  const gaps: ApplicationGap[] = []

  const named =
    filled(talent.professional_name) || (filled(profile.first_name) && filled(profile.last_name))
  if (!named) gaps.push('name')

  const hasPhoto =
    filled(profile.avatar_url) ||
    media.some((asset) => asset.kind === 'headshot' || asset.kind === 'portfolio')
  if (!hasPhoto) gaps.push('photo')

  if (talent.playing_age_min === null || talent.playing_age_max === null) gaps.push('playingAge')
  if (!filled(profile.city)) gaps.push('location')

  return gaps
}
