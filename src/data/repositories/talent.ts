import { supabase } from '@/lib/supabase'
import type {
  CreditRow,
  LanguageRow,
  MediaAssetRow,
  ProfileRow,
  SkillRow,
  TalentProfileRow,
  TrainingRow,
} from '@/types/database'

/**
 * Everything that makes up a talent profile. One composite read for the profile
 * page (a single round trip per section family), plus focused writes.
 */

export type TalentSkill = { skillId: string; name: string; category: string | null; level: 1 | 2 | 3 }
export type TalentLanguage = { code: string; name: string; fluency: string | null }

export type TalentProfileFull = {
  profile: ProfileRow
  talent: TalentProfileRow
  skills: TalentSkill[]
  languages: TalentLanguage[]
  credits: CreditRow[]
  training: TrainingRow[]
  media: MediaAssetRow[]
}

export async function getTalentProfileFull(profileId: string): Promise<TalentProfileFull | null> {
  const [profileRes, talentRes, skillsRes, languagesRes, creditsRes, trainingRes, mediaRes] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
      supabase.from('talent_profiles').select('*').eq('profile_id', profileId).maybeSingle(),
      supabase
        .from('talent_skills')
        .select('skill_id, level, skills(id, name, category)')
        .eq('talent_id', profileId),
      supabase
        .from('talent_languages')
        .select('language, fluency, languages(code, name)')
        .eq('talent_id', profileId),
      supabase
        .from('credits')
        .select('*')
        .eq('talent_id', profileId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('training')
        .select('*')
        .eq('talent_id', profileId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('media_assets')
        .select('*')
        .eq('owner_id', profileId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false }),
    ])

  for (const response of [profileRes, talentRes, skillsRes, languagesRes, creditsRes, trainingRes, mediaRes]) {
    if (response.error) throw response.error
  }
  if (!profileRes.data || !talentRes.data) return null

  type SkillJoin = { skill_id: string; level: 1 | 2 | 3; skills: SkillRow | null }
  type LanguageJoin = { language: string; fluency: string | null; languages: LanguageRow | null }

  const skills = ((skillsRes.data ?? []) as unknown as SkillJoin[])
    .map((row) => ({
      skillId: row.skill_id,
      name: row.skills?.name ?? '',
      category: row.skills?.category ?? null,
      level: row.level,
    }))
    .filter((skill) => skill.name)
    .sort((a, b) => a.name.localeCompare(b.name))

  const languages = ((languagesRes.data ?? []) as unknown as LanguageJoin[])
    .map((row) => ({
      code: row.language,
      name: row.languages?.name ?? row.language,
      fluency: row.fluency,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    profile: profileRes.data,
    talent: talentRes.data,
    skills,
    languages,
    credits: creditsRes.data ?? [],
    training: trainingRes.data ?? [],
    media: mediaRes.data ?? [],
  }
}

// ── Reference lists (autocomplete) ───────────────────────────────────────────

export async function listSkills(): Promise<SkillRow[]> {
  const { data, error } = await supabase.from('skills').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function listLanguages(): Promise<LanguageRow[]> {
  const { data, error } = await supabase.from('languages').select('*').order('name')
  if (error) throw error
  return data ?? []
}

/** Finds a skill by name, creating it if the talent typed a new one. */
export async function ensureSkill(name: string): Promise<SkillRow> {
  const trimmed = name.trim()
  const { data: existing, error: findError } = await supabase
    .from('skills')
    .select('*')
    .ilike('name', trimmed)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return existing

  const { data, error } = await supabase
    .from('skills')
    .insert({ name: trimmed })
    .select('*')
    .single()
  if (error) throw error
  return data
}

// ── Skills ───────────────────────────────────────────────────────────────────

export async function addTalentSkill(
  talentId: string,
  skillName: string,
  level: 1 | 2 | 3 = 2,
): Promise<void> {
  const skill = await ensureSkill(skillName)
  const { error } = await supabase
    .from('talent_skills')
    .upsert({ talent_id: talentId, skill_id: skill.id, level }, { onConflict: 'talent_id,skill_id' })
  if (error) throw error
}

export async function setTalentSkillLevel(
  talentId: string,
  skillId: string,
  level: 1 | 2 | 3,
): Promise<void> {
  const { error } = await supabase
    .from('talent_skills')
    .update({ level })
    .eq('talent_id', talentId)
    .eq('skill_id', skillId)
  if (error) throw error
}

export async function removeTalentSkill(talentId: string, skillId: string): Promise<void> {
  const { error } = await supabase
    .from('talent_skills')
    .delete()
    .eq('talent_id', talentId)
    .eq('skill_id', skillId)
  if (error) throw error
}

// ── Languages ────────────────────────────────────────────────────────────────

export async function setTalentLanguages(talentId: string, codes: string[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from('talent_languages')
    .delete()
    .eq('talent_id', talentId)
  if (deleteError) throw deleteError

  if (codes.length === 0) return
  const { error } = await supabase
    .from('talent_languages')
    .insert(codes.map((code) => ({ talent_id: talentId, language: code })))
  if (error) throw error
}

// ── Credits ──────────────────────────────────────────────────────────────────

export type CreditInput = Omit<CreditRow, 'id' | 'talent_id' | 'created_at'>

export async function createCredit(talentId: string, input: CreditInput): Promise<CreditRow> {
  const { data, error } = await supabase
    .from('credits')
    .insert({ talent_id: talentId, ...input })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateCredit(id: string, patch: Partial<CreditInput>): Promise<CreditRow> {
  const { data, error } = await supabase
    .from('credits')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteCredit(id: string): Promise<void> {
  const { error } = await supabase.from('credits').delete().eq('id', id)
  if (error) throw error
}

/** Persists a new order after a drag / move. */
export async function reorderCredits(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, index) =>
      supabase
        .from('credits')
        .update({ sort_order: index })
        .eq('id', id)
        .then(({ error }) => {
          if (error) throw error
        }),
    ),
  )
}

// ── Training ─────────────────────────────────────────────────────────────────

export type TrainingInput = Omit<TrainingRow, 'id' | 'talent_id' | 'created_at'>

export async function createTraining(talentId: string, input: TrainingInput): Promise<TrainingRow> {
  const { data, error } = await supabase
    .from('training')
    .insert({ talent_id: talentId, ...input })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateTraining(
  id: string,
  patch: Partial<TrainingInput>,
): Promise<TrainingRow> {
  const { data, error } = await supabase
    .from('training')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteTraining(id: string): Promise<void> {
  const { error } = await supabase.from('training').delete().eq('id', id)
  if (error) throw error
}
