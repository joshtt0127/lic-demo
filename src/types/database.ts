/**
 * Let It Cast — database types.
 *
 * Hand-authored mirror of `supabase/migrations/*`. It can be regenerated from a
 * live project at any time (see `docs/DATABASE.md`):
 *
 *   npm run db:types
 *
 * Keep it in sync with the migrations — it is the contract every repository in
 * `src/data/repositories/` relies on.
 */

export type AccountType = 'talent' | 'production'
export type OrgRole = 'owner' | 'admin' | 'casting_director' | 'member' | 'viewer'
export type MemberStatus = 'active' | 'invited' | 'removed'
export type ProjectStatus = 'draft' | 'casting' | 'callbacks' | 'pre_production' | 'cast' | 'archived'
export type CastingStatus = 'draft' | 'published' | 'closed' | 'archived'
export type CastingVisibility = 'public' | 'private'
export type CastingFormat = 'scripted' | 'non_scripted'
export type RoleTypeDb = 'lead' | 'supporting' | 'contestant'
export type AuditionFlowDb = 'open_call' | 'invited' | 'in_house'
export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'viewed'
  | 'under_review'
  | 'shortlisted'
  | 'callback'
  | 'offer'
  | 'cast'
  | 'not_selected'
  | 'withdrawn'
export type ReviewVote = 'no' | 'maybe' | 'good'
export type MediaKind =
  | 'avatar'
  | 'cover'
  | 'headshot'
  | 'portfolio'
  | 'showreel'
  | 'selftape'
  | 'poster'
  | 'logo'
export type NoteVisibility = 'team' | 'private'
export type ConversationContext = 'application' | 'project' | 'casting_call' | 'role' | 'direct'
export type AvailabilityStatus = 'available' | 'on_project' | 'unavailable'
export type Locale = 'en' | 'fr'

// ── Rows ─────────────────────────────────────────────────────────────────────

export interface ProfileRow {
  id: string
  account_type: AccountType | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  locale: Locale
  city: string | null
  country: string | null
  onboarding_step: string | null
  onboarding_completed_at: string | null
  created_at: string
  updated_at: string
}

export interface TalentProfileRow {
  profile_id: string
  professional_name: string | null
  headline: string | null
  bio: string | null
  cover_url: string | null
  gender: string | null
  ethnicities: string[]
  playing_age_min: number | null
  playing_age_max: number | null
  height_cm: number | null
  nationalities: string[]
  accents: string[]
  union_name: string | null
  experience_level: string | null
  availability: AvailabilityStatus
  website: string | null
  agency_name: string | null
  agent_name: string | null
  agent_email: string | null
  agent_phone: string | null
  created_at: string
  updated_at: string
}

export interface ProductionProfileRow {
  profile_id: string
  job_title: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface SkillRow {
  id: string
  name: string
  category: string | null
}

export interface LanguageRow {
  code: string
  name: string
}

export interface TalentSkillRow {
  talent_id: string
  skill_id: string
  level: 1 | 2 | 3
}

export interface TalentLanguageRow {
  talent_id: string
  language: string
  fluency: string | null
}

export interface CreditRow {
  id: string
  talent_id: string
  title: string
  role_name: string | null
  category: string | null
  year: string | null
  director: string | null
  company: string | null
  location: string | null
  url: string | null
  sort_order: number
  created_at: string
}

export interface TrainingRow {
  id: string
  talent_id: string
  school: string
  program: string | null
  start_year: string | null
  end_year: string | null
  description: string | null
  sort_order: number
  created_at: string
}

export interface MediaAssetRow {
  id: string
  owner_id: string
  kind: MediaKind
  bucket: string
  path: string
  mime: string | null
  bytes: number | null
  width: number | null
  height: number | null
  duration_s: number | null
  caption: string | null
  sort_order: number
  created_at: string
}

export interface OrganizationRow {
  id: string
  name: string
  slug: string
  logo_url: string | null
  description: string | null
  website: string | null
  company_type: string | null
  city: string | null
  country: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface OrganizationMemberRow {
  org_id: string
  profile_id: string
  role: OrgRole
  status: MemberStatus
  created_at: string
}

export interface OrganizationInviteRow {
  id: string
  org_id: string
  email: string
  role: OrgRole
  token: string
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export interface ProjectRow {
  id: string
  org_id: string
  title: string
  subtitle: string | null
  synopsis: string | null
  director_brief: string | null
  production_type: string | null
  genre: string | null
  company_name: string | null
  director_name: string | null
  casting_director_name: string | null
  poster_url: string | null
  shooting_location: string | null
  shooting_start: string | null
  shooting_end: string | null
  status: ProjectStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectMemberRow {
  project_id: string
  profile_id: string
  role: OrgRole
  created_at: string
}

export interface CastingCallRow {
  id: string
  project_id: string
  title: string
  description: string | null
  location: string | null
  deadline_at: string | null
  compensation: string | null
  visibility: CastingVisibility
  format: CastingFormat
  status: CastingStatus
  published_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RoleRow {
  id: string
  casting_call_id: string
  name: string
  description: string | null
  role_type: RoleTypeDb
  gender_pref: string | null
  playing_age_min: number | null
  playing_age_max: number | null
  location: string | null
  languages: string[]
  accents: string[]
  skills: string[]
  requirements: string | null
  compensation: string | null
  selftape_instructions: string | null
  sides_url: string | null
  shooting_start: string | null
  shooting_end: string | null
  audition_flow: AuditionFlowDb
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ApplicationRow {
  id: string
  role_id: string
  talent_id: string
  status: ApplicationStatus
  note: string | null
  headshot_id: string | null
  showreel_id: string | null
  submitted_at: string | null
  viewed_at: string | null
  decided_at: string | null
  source: string
  created_at: string
  updated_at: string
}

export interface SelfTapeRow {
  id: string
  application_id: string
  media_asset_id: string
  duration_s: number | null
  submitted_at: string
}

export interface ApplicationMediaRow {
  application_id: string
  media_asset_id: string
}

export interface CandidateReviewRow {
  id: string
  application_id: string
  reviewer_id: string
  vote: ReviewVote
  comment: string | null
  created_at: string
  updated_at: string
}

export interface CandidateNoteRow {
  id: string
  application_id: string
  author_id: string
  body: string
  visibility: NoteVisibility
  created_at: string
}

export interface SavedSearchRow {
  id: string
  owner_id: string
  project_id: string | null
  name: string
  filters: Record<string, unknown>
  created_at: string
}

export interface SavedCastingRow {
  talent_id: string
  casting_call_id: string
  created_at: string
}

export interface ConversationRow {
  id: string
  subject: string | null
  context_type: ConversationContext
  context_id: string | null
  org_id: string | null
  created_by: string | null
  last_message_at: string
  created_at: string
}

export interface ConversationMemberRow {
  conversation_id: string
  profile_id: string
  last_read_at: string | null
  created_at: string
}

export interface MessageRow {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export interface NotificationRow {
  id: string
  recipient_id: string
  type: string
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

export interface AnalyticsEventRow {
  id: number
  profile_id: string | null
  name: string
  props: Record<string, unknown>
  created_at: string
}

// ── Views ────────────────────────────────────────────────────────────────────

export interface CandidateViewRow {
  application_id: string
  role_id: string
  talent_id: string
  status: ApplicationStatus
  note: string | null
  submitted_at: string | null
  viewed_at: string | null
  created_at: string
  role_name: string
  casting_call_id: string
  project_id: string
  name: string
  avatar_url: string | null
  city: string | null
  country: string | null
  gender: string | null
  playing_age_min: number | null
  playing_age_max: number | null
  nationalities: string[]
  experience_level: string | null
  languages: string[]
  good_count: number
  maybe_count: number
  no_count: number
  score: number
  has_self_tape: boolean
}

export interface RoleStatsViewRow {
  role_id: string
  casting_call_id: string
  project_id: string
  submissions: number
  new_submissions: number
  shortlist: number
  callbacks: number
  booked: number
}

export interface ProjectStatsViewRow {
  project_id: string
  roles: number
  lead_roles: number
  supporting_roles: number
  submissions: number
  submissions_today: number
  shortlist: number
  callbacks: number
  booked: number
}

// ── Supabase client shape ────────────────────────────────────────────────────

/** Generated-types convention: a writable table exposes Row / Insert / Update. */
type Writable<Row, Required extends keyof Row = never> = {
  Row: Row
  Insert: Partial<Row> & Pick<Row, Required>
  Update: Partial<Row>
  Relationships: []
}

/** A view is read-only. */
type ReadOnly<Row> = { Row: Row; Relationships: [] }

export interface Database {
  public: {
    Tables: {
      profiles: Writable<ProfileRow, 'id'>
      talent_profiles: Writable<TalentProfileRow, 'profile_id'>
      production_profiles: Writable<ProductionProfileRow, 'profile_id'>
      skills: Writable<SkillRow, 'name'>
      languages: Writable<LanguageRow, 'code' | 'name'>
      talent_skills: Writable<TalentSkillRow, 'talent_id' | 'skill_id'>
      talent_languages: Writable<TalentLanguageRow, 'talent_id' | 'language'>
      credits: Writable<CreditRow, 'talent_id' | 'title'>
      training: Writable<TrainingRow, 'talent_id' | 'school'>
      media_assets: Writable<MediaAssetRow, 'owner_id' | 'kind' | 'bucket' | 'path'>
      organizations: Writable<OrganizationRow, 'name' | 'slug'>
      organization_members: Writable<OrganizationMemberRow, 'org_id' | 'profile_id'>
      organization_invites: Writable<OrganizationInviteRow, 'org_id' | 'email'>
      projects: Writable<ProjectRow, 'org_id' | 'title'>
      project_members: Writable<ProjectMemberRow, 'project_id' | 'profile_id'>
      casting_calls: Writable<CastingCallRow, 'project_id' | 'title'>
      roles: Writable<RoleRow, 'casting_call_id' | 'name'>
      applications: Writable<ApplicationRow, 'role_id' | 'talent_id'>
      self_tapes: Writable<SelfTapeRow, 'application_id' | 'media_asset_id'>
      application_media: Writable<ApplicationMediaRow, 'application_id' | 'media_asset_id'>
      candidate_reviews: Writable<CandidateReviewRow, 'application_id' | 'reviewer_id' | 'vote'>
      candidate_notes: Writable<CandidateNoteRow, 'application_id' | 'author_id' | 'body'>
      saved_searches: Writable<SavedSearchRow, 'owner_id' | 'name'>
      saved_castings: Writable<SavedCastingRow, 'talent_id' | 'casting_call_id'>
      conversations: Writable<ConversationRow>
      conversation_members: Writable<ConversationMemberRow, 'conversation_id' | 'profile_id'>
      messages: Writable<MessageRow, 'conversation_id' | 'sender_id' | 'body'>
      notifications: Writable<NotificationRow, 'recipient_id' | 'type' | 'title'>
      analytics_events: Writable<AnalyticsEventRow, 'name'>
    }
    Views: {
      v_candidates: ReadOnly<CandidateViewRow>
      v_role_stats: ReadOnly<RoleStatsViewRow>
      v_project_stats: ReadOnly<ProjectStatsViewRow>
    }
    Functions: Record<string, never>
    Enums: {
      account_type: AccountType
      org_role: OrgRole
      member_status: MemberStatus
      project_status: ProjectStatus
      casting_status: CastingStatus
      casting_visibility: CastingVisibility
      casting_format: CastingFormat
      role_type: RoleTypeDb
      audition_flow: AuditionFlowDb
      application_status: ApplicationStatus
      review_vote: ReviewVote
      media_kind: MediaKind
      note_visibility: NoteVisibility
      conversation_context: ConversationContext
      availability_status: AvailabilityStatus
    }
    CompositeTypes: Record<string, never>
  }
}
