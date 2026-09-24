import { supabase } from '@/lib/supabase'
import type {
  CastingCallRow,
  CastingStatus,
  ProjectRow,
  ProjectStatsViewRow,
  ProjectStatus,
  RoleRow,
  RoleStatsViewRow,
  RoleStatus,
} from '@/types/database'

/**
 * Production side: projects, casting calls and roles.
 *
 * They form one aggregate in practice — a casting call always belongs to a
 * project, a role always belongs to a casting call — so they share a repository.
 */

// ── Projects ─────────────────────────────────────────────────────────────────

export type ProjectInput = {
  title: string
  productionType?: string | null
  genre?: string | null
  companyName?: string | null
  directorName?: string | null
  castingDirectorName?: string | null
  synopsis?: string | null
  directorBrief?: string | null
  shootingLocation?: string | null
  shootingStart?: string | null
  shootingEnd?: string | null
  posterUrl?: string | null
  status?: ProjectStatus
}

function projectPayload(input: ProjectInput) {
  return {
    title: input.title.trim(),
    production_type: input.productionType ?? null,
    genre: input.genre ?? null,
    company_name: input.companyName ?? null,
    director_name: input.directorName ?? null,
    casting_director_name: input.castingDirectorName ?? null,
    synopsis: input.synopsis ?? null,
    director_brief: input.directorBrief ?? null,
    shooting_location: input.shootingLocation ?? null,
    shooting_start: input.shootingStart || null,
    shooting_end: input.shootingEnd || null,
    poster_url: input.posterUrl ?? null,
    ...(input.status ? { status: input.status } : {}),
  }
}

export async function listProjects(orgId: string): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createProject(
  orgId: string,
  createdBy: string,
  input: ProjectInput,
): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from('projects')
    .insert({ org_id: orgId, created_by: createdBy, ...projectPayload(input) })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateProject(id: string, input: ProjectInput): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from('projects')
    .update(projectPayload(input))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function setProjectStatus(id: string, status: ProjectStatus): Promise<void> {
  const { error } = await supabase.from('projects').update({ status }).eq('id', id)
  if (error) throw error
}

export async function projectStats(orgId: string): Promise<ProjectStatsViewRow[]> {
  const projects = await listProjects(orgId)
  if (projects.length === 0) return []
  const { data, error } = await supabase
    .from('v_project_stats')
    .select('*')
    .in(
      'project_id',
      projects.map((project) => project.id),
    )
  if (error) throw error
  return data ?? []
}

// ── Casting calls ────────────────────────────────────────────────────────────

export type CastingWithProject = CastingCallRow & {
  project: Pick<
    ProjectRow,
    | 'id'
    | 'title'
    | 'production_type'
    | 'company_name'
    | 'poster_url'
    | 'genre'
    | 'shooting_start'
    | 'shooting_end'
    | 'shooting_location'
    | 'synopsis'
  > | null
  roles: RoleRow[]
}

const CASTING_SELECT = `
  *,
  projects (
    id, title, production_type, company_name, poster_url, genre,
    shooting_start, shooting_end, shooting_location, synopsis
  ),
  roles (*)
`

type CastingJoin = CastingCallRow & {
  projects: CastingWithProject['project']
  roles: RoleRow[] | null
}

function shapeCasting(row: CastingJoin): CastingWithProject {
  const { projects, roles, ...casting } = row
  return {
    ...casting,
    project: projects,
    roles: [...(roles ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }
}

/** Every casting of the organization, drafts included. */
/**
 * Inviter un comédien sur un casting.
 *
 * L'invitation ouvre la porte, elle ne candidate pas à sa place : c'est lui qui
 * décide d'entrer. Postuler pour quelqu'un d'autre serait une autre promesse.
 */
export async function inviteTalentToCasting(input: {
  castingId: string
  talentId: string
  invitedBy: string
  message?: string | null
}): Promise<void> {
  const { error } = await supabase.from('casting_invites').upsert(
    {
      casting_call_id: input.castingId,
      talent_id: input.talentId,
      invited_by: input.invitedBy,
      message: input.message?.trim() || null,
    },
    { onConflict: 'casting_call_id,talent_id' },
  )
  if (error) throw error
}

export async function listOrgCastings(orgId: string): Promise<CastingWithProject[]> {
  const projects = await listProjects(orgId)
  if (projects.length === 0) return []

  const { data, error } = await supabase
    .from('casting_calls')
    .select(CASTING_SELECT)
    .in(
      'project_id',
      projects.map((project) => project.id),
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as CastingJoin[]).map(shapeCasting)
}

export async function getOrgCasting(id: string): Promise<CastingWithProject | null> {
  const { data, error } = await supabase
    .from('casting_calls')
    .select(CASTING_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? shapeCasting(data as unknown as CastingJoin) : null
}

export type CastingInput = {
  projectId: string
  title: string
  description?: string | null
  location?: string | null
  deadlineAt?: string | null
  compensation?: string | null
  format?: 'scripted' | 'non_scripted'
}

export async function createCasting(
  createdBy: string,
  input: CastingInput,
): Promise<CastingCallRow> {
  const { data, error } = await supabase
    .from('casting_calls')
    .insert({
      project_id: input.projectId,
      title: input.title.trim(),
      description: input.description ?? null,
      location: input.location ?? null,
      deadline_at: input.deadlineAt || null,
      compensation: input.compensation ?? null,
      format: input.format ?? 'scripted',
      status: 'draft',
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateCasting(
  id: string,
  input: Partial<Omit<CastingInput, 'projectId'>>,
): Promise<CastingCallRow> {
  const { data, error } = await supabase
    .from('casting_calls')
    .update({
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.deadlineAt !== undefined ? { deadline_at: input.deadlineAt || null } : {}),
      ...(input.compensation !== undefined ? { compensation: input.compensation } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** Publishing is what makes the roles visible to talents (see the RLS policies). */
export async function setCastingStatus(id: string, status: CastingStatus): Promise<void> {
  const { error } = await supabase
    .from('casting_calls')
    .update({
      status,
      ...(status === 'published' ? { published_at: new Date().toISOString() } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

// ── Roles ────────────────────────────────────────────────────────────────────

export type RoleInput = {
  name: string
  description?: string | null
  roleType?: 'lead' | 'supporting' | 'contestant'
  genderPref?: string | null
  playingAgeMin?: number | null
  playingAgeMax?: number | null
  location?: string | null
  languages?: string[]
  accents?: string[]
  skills?: string[]
  requirements?: string | null
  compensation?: string | null
  selftapeInstructions?: string | null
  sidesUrl?: string | null
  auditionFlow?: 'open_call' | 'invited' | 'in_house'
  sortOrder?: number
}

function rolePayload(input: RoleInput) {
  return {
    name: input.name.trim(),
    description: input.description ?? null,
    role_type: input.roleType ?? 'supporting',
    gender_pref: input.genderPref ?? null,
    playing_age_min: input.playingAgeMin ?? null,
    playing_age_max: input.playingAgeMax ?? null,
    location: input.location ?? null,
    languages: input.languages ?? [],
    accents: input.accents ?? [],
    skills: input.skills ?? [],
    requirements: input.requirements ?? null,
    compensation: input.compensation ?? null,
    selftape_instructions: input.selftapeInstructions ?? null,
    sides_url: input.sidesUrl ?? null,
    audition_flow: input.auditionFlow ?? 'open_call',
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
  }
}

export async function createRole(castingCallId: string, input: RoleInput): Promise<RoleRow> {
  const { data, error } = await supabase
    .from('roles')
    .insert({ casting_call_id: castingCallId, ...rolePayload(input) })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateRole(id: string, input: RoleInput): Promise<RoleRow> {
  const { data, error } = await supabase
    .from('roles')
    .update(rolePayload(input))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** The one piece of a role's state a human decides. */
export async function setRoleStatus(id: string, status: RoleStatus): Promise<void> {
  const { error } = await supabase.from('roles').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteRole(id: string): Promise<void> {
  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) throw error
}

export async function roleStats(roleIds: string[]): Promise<RoleStatsViewRow[]> {
  if (roleIds.length === 0) return []
  const { data, error } = await supabase.from('v_role_stats').select('*').in('role_id', roleIds)
  if (error) throw error
  return data ?? []
}
