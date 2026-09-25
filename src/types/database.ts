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
 *
 * Gotcha: every row type is a `type` alias, never an `interface`. TypeScript only
 * gives implicit index signatures to aliases, and Supabase's `GenericSchema`
 * constraint requires `Row extends Record<string, unknown>`. An interface here
 * silently resolves the whole schema to `never`, and every `.insert()` /
 * `.update()` payload then fails to typecheck.
 */

export type AccountType = 'talent' | 'production'
export type OrgRole = 'owner' | 'admin' | 'casting_director' | 'member' | 'viewer'
export type MemberStatus = 'active' | 'invited' | 'removed'
export type ProjectStatus = 'draft' | 'casting' | 'callbacks' | 'pre_production' | 'cast' | 'archived'
export type CastingStatus = 'draft' | 'published' | 'closed' | 'archived'
/**
 * `private` est la valeur d'origine, gardée pour les lignes historiques ;
 * les trois portées réellement proposées sont les autres.
 */
export type CastingVisibility = 'public' | 'private' | 'private_link' | 'invite_only'
export type CastingFormat = 'scripted' | 'non_scripted'
export type RoleTypeDb = 'lead' | 'supporting' | 'contestant'
export type AuditionFlowDb = 'open_call' | 'invited' | 'in_house'
export type RoleStatus = 'open' | 'reviewing' | 'callbacks' | 'booked' | 'closed'
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

export type ProfileRow = {
  id: string
  account_type: AccountType | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  locale: Locale
  /** Opt-out for notification emails (honoured by the database trigger). */
  email_notifications: boolean
  city: string | null
  country: string | null
  onboarding_step: string | null
  /** Déclaration de majorité — aucune date de naissance stockée. */
  adult_confirmed_at: string | null
  /** none · support · admin — posé en base, jamais depuis l'app. */
  platform_role: 'none' | 'support' | 'admin'
  suspended_at: string | null
  suspended_reason: string | null
  onboarding_completed_at: string | null
  created_at: string
  updated_at: string
}

export type TalentProfileRow = {
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

export type ProductionProfileRow = {
  profile_id: string
  job_title: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export type SkillRow = {
  id: string
  name: string
  category: string | null
}

export type LanguageRow = {
  code: string
  name: string
}

export type TalentSkillRow = {
  talent_id: string
  skill_id: string
  level: 1 | 2 | 3
}

export type TalentLanguageRow = {
  talent_id: string
  language: string
  fluency: string | null
}

export type CreditRow = {
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

export type TrainingRow = {
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

export type MediaAssetRow = {
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

export type OrganizationRow = {
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
  /** unverified (défaut) · verified (peut publier) · suspended. */
  verification_status: 'unverified' | 'verified' | 'suspended'
  verified_at: string | null
  suspended_reason: string | null
  created_at: string
  updated_at: string
}

export type OrganizationMemberRow = {
  org_id: string
  profile_id: string
  role: OrgRole
  status: MemberStatus
  created_at: string
}

export type OrganizationInviteRow = {
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

export type ProjectRow = {
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

export type ProjectMemberRow = {
  project_id: string
  profile_id: string
  role: OrgRole
  created_at: string
}

export type CastingCallRow = {
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

export type RoleRow = {
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
  /** Le rôle exige une self-tape pour que la candidature parte. */
  self_tape_required: boolean
  sides_url: string | null
  shooting_start: string | null
  shooting_end: string | null
  audition_flow: AuditionFlowDb
  status: RoleStatus
  sort_order: number
  created_at: string
  updated_at: string
}

export type ApplicationRow = {
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

export type SelfTapeRow = {
  id: string
  application_id: string
  media_asset_id: string
  duration_s: number | null
  submitted_at: string
}

export type ApplicationMediaRow = {
  application_id: string
  media_asset_id: string
}

export type CandidateReviewRow = {
  id: string
  application_id: string
  reviewer_id: string
  vote: ReviewVote
  comment: string | null
  created_at: string
  updated_at: string
}

export type CandidateNoteRow = {
  id: string
  application_id: string
  author_id: string
  body: string
  visibility: NoteVisibility
  created_at: string
}

export type SavedSearchRow = {
  id: string
  owner_id: string
  project_id: string | null
  name: string
  filters: Record<string, unknown>
  created_at: string
}

export type SavedTalentRow = {
  production_id: string
  talent_id: string
  note: string | null
  created_at: string
}

export type SavedCastingRow = {
  talent_id: string
  casting_call_id: string
  created_at: string
}

export type ConversationRow = {
  id: string
  subject: string | null
  context_type: ConversationContext
  context_id: string | null
  org_id: string | null
  created_by: string | null
  last_message_at: string
  created_at: string
}

export type ConversationMemberRow = {
  conversation_id: string
  profile_id: string
  last_read_at: string | null
  created_at: string
}

export type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export type NotificationRow = {
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

export type AnalyticsEventRow = {
  id: number
  profile_id: string | null
  name: string
  props: Record<string, unknown>
  created_at: string
}

// ── Views ────────────────────────────────────────────────────────────────────

/** L'avis de l'IA sur une tape — une note par trait, avec sa justification. */
export type TapeAiReviewRow = {
  id: string
  self_tape_id: string
  requested_by: string | null
  status: 'pending' | 'ready' | 'failed'
  model: string | null
  traits_asked: string[]
  traits: { trait: string; score: number | null; evidence: string }[]
  fit_score: number | null
  summary: string | null
  strengths: string[]
  risks: string[]
  /** Ce qu'un directeur de casting ferait de ce comédien — jamais une décision. */
  recommendation: 'callback' | 'maybe' | 'pass' | null
  /** L'ajustement qu'il demanderait pour une seconde prise. */
  direction: string | null
  frames: number | null
  error: string | null
  created_at: string
  completed_at: string | null
}

/** Une erreur remontée par un navigateur. Aucun contenu utilisateur. */
export type ClientErrorRow = {
  id: number
  occurred_at: string
  profile_id: string | null
  kind: string
  message: string
  stack: string | null
  route: string | null
  user_agent: string | null
  release: string | null
}

/** Les compteurs qui disent qu'un parcours critique est cassé. */
export type OpsHealthViewRow = {
  emails_not_sent_24h: number
  emails_stuck: number
  ai_failures_24h: number
  ai_stuck: number
  client_errors_24h: number
  reports_open: number
  deletions_pending: number
}

/**
 * Une bande d'attention. Trois valeurs, jamais un nombre.
 *
 * `priority` — quelque chose attend une décision · `discovery` — un dossier
 * complet que cette production ne connaît pas et que personne n'a ouvert ·
 * `all` — tout le reste, toujours accessible.
 */
export type AttentionBand = 'priority' | 'discovery' | 'all'

/**
 * Pourquoi une candidature est remontée, avec les faits qui le prouvent.
 *
 * La base renvoie un code et des nombres, jamais une phrase : c'est l'interface
 * qui écrit, et c'est la seule façon de garantir qu'une explication ne peut pas
 * dire autre chose que ce que la règle a réellement fait.
 */
export type AttentionReason =
  | { code: 'deadline_close'; hours_left: number }
  | { code: 'overdue'; waiting_hours: number; usual_hours: number }
  | { code: 'worked_with_you'; times: number }
  | { code: 'called_back_before'; times: number }
  | { code: 'shortlisted_before'; times: number }
  | { code: 'team_waiting'; votes: number }
  | { code: 'rewatched'; times: number }
  | { code: 'watched_fully' }
  | { code: 'new_to_you' }
  | { code: 'tape_ready'; quality: number | null }
  | { code: 'complete_submission' }
  | { code: 'never_opened'; waiting_hours: number }

/** Une ligne du feed d'attention : la candidature, sa bande, et ses raisons. */
export type IntelligenceFeedRow = {
  application_id: string
  talent_id: string
  role_id: string
  role_name: string
  status: ApplicationStatus
  submitted_at: string | null
  waiting_hours: number
  band: AttentionBand
  band_rank: number
  queue_rank: number
  reasons: AttentionReason[]
  engine_version: string
  computed_at: string
}

/** Talent Graph : ce qu'une organisation se rappelle d'un comédien. */
export type TalentMemoryViewRow = {
  talent_id: string
  org_id: string
  applications: number
  shortlisted: number
  callbacks: number
  cast_in: number
  passed: number
  withdrawn: number
  first_application_at: string | null
  last_application_at: string | null
  last_decision_at: string | null
  role_types: string[]
  profile_views: number
  tape_opens: number
  tape_completions: number
  tape_rewatches: number
  last_attention_at: string | null
  known_here: boolean
}

/** Production Graph : le comportement observé d'une organisation. */
export type ProductionMemoryViewRow = {
  org_id: string
  applications_seen: number
  talents_seen: number
  applications_reviewed: number
  applications_decided: number
  shortlisted: number
  cast_total: number
  median_hours_to_first_view: number | null
  median_hours_to_decision: number | null
  review_coverage: number | null
  shortlisted_by_role_type: Record<string, number>
}

/** La carte d'un comédien dans le fil : nom professionnel et accroche, rien d'autre. */
export type TalentCardViewRow = {
  profile_id: string
  professional_name: string | null
  headline: string | null
}

/** Le journal des actions administratives : qui, quoi, pourquoi, quand. */
export type AdminActionRow = {
  id: string
  actor_id: string | null
  action: string
  subject_type: string
  subject_id: string | null
  reason: string
  metadata: Record<string, unknown>
  created_at: string
}

export type ReportReason =
  | 'spam'
  | 'impersonation'
  | 'harassment'
  | 'inappropriate'
  | 'fraudulent_casting'
  | 'other'

/** Un signalement : un dossier à traiter, jamais une suppression. */
export type ReportRow = {
  id: string
  reporter_id: string
  subject_type: 'profile' | 'post' | 'casting_call' | 'message'
  subject_id: string
  reason: ReportReason
  details: string | null
  status: 'open' | 'in_review' | 'resolved' | 'dismissed'
  resolution: string | null
  handled_by: string | null
  handled_at: string | null
  created_at: string
}

/** Un blocage : coupe ce qui vient, ne touche pas à l'historique. */
export type BlockRow = {
  blocker_id: string
  blocked_id: string
  created_at: string
}

export type CallbackKind = 'in_person' | 'video_call' | 'self_tape'
export type CallbackResponse = 'pending' | 'accepted' | 'declined' | 'change_requested'

/** Le rendez-vous proposé après une présélection, et la réponse du comédien. */
export type CallbackRow = {
  id: string
  application_id: string
  kind: CallbackKind
  title: string | null
  scheduled_at: string | null
  timezone: string | null
  location: string | null
  meeting_url: string | null
  instructions: string | null
  message: string | null
  respond_by: string | null
  response: CallbackResponse
  response_note: string | null
  responded_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Qui a le droit de voir un casting sur invitation. Aucune candidature impliquée. */
export type CastingInviteRow = {
  id: string
  casting_call_id: string
  talent_id: string
  invited_by: string | null
  message: string | null
  created_at: string
}

/** Un fait canonique du workflow — écrit par la base, jamais par un client. */
export type EventRow = {
  id: number
  type: string
  occurred_at: string
  actor_id: string | null
  entity_type: string
  entity_id: string
  org_id: string | null
  subject_id: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  source: string
  metadata: Record<string, unknown>
}

/** What the browser measured about a self-tape when it was sent. */
export type TapeCheckRow = {
  self_tape_id: string
  duration_s: number | null
  width: number | null
  height: number | null
  framing: 'portrait' | 'landscape' | 'square' | null
  brightness: number | null
  has_audio: boolean | null
  bytes: number | null
  checks: { key: string; ok: boolean | null; detail: Record<string, string | number | null> }[]
  score: number | null
  created_at: string
}

/** Une publication d'un membre — la partie « réseau » du fil. */
export type PostRow = {
  id: string
  author_id: string
  body: string
  media_asset_id: string | null
  created_at: string
}

export type PostLikeRow = {
  post_id: string
  profile_id: string
  created_at: string
}

/** The social graph: a profile follows a profile, or an organization. */
export type FollowRow = {
  follower_id: string
  following_id: string
  created_at: string
}

export type OrganizationFollowRow = {
  profile_id: string
  org_id: string
  created_at: string
}

/** Counted on the rows themselves — never stored. */
export type ProfileNetworkViewRow = {
  profile_id: string
  followers: number
  following: number
  organizations_followed: number
}

export type CandidateViewRow = {
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

export type RoleStatsViewRow = {
  role_id: string
  casting_call_id: string
  project_id: string
  submissions: number
  new_submissions: number
  shortlist: number
  callbacks: number
  booked: number
}

export type ProjectStatsViewRow = {
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

export type Database = {
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
      saved_talents: Writable<SavedTalentRow, 'production_id' | 'talent_id'>
      conversations: Writable<ConversationRow>
      conversation_members: Writable<ConversationMemberRow, 'conversation_id' | 'profile_id'>
      messages: Writable<MessageRow, 'conversation_id' | 'sender_id' | 'body'>
      notifications: Writable<NotificationRow, 'recipient_id' | 'type' | 'title'>
      analytics_events: Writable<AnalyticsEventRow, 'name'>
      tape_checks: Writable<TapeCheckRow, 'self_tape_id'>
      tape_ai_reviews: Writable<TapeAiReviewRow, 'self_tape_id'>
      admin_actions: Writable<AdminActionRow, 'action' | 'subject_type' | 'reason'>
      client_errors: Writable<ClientErrorRow, 'kind' | 'message'>
      blocks: Writable<BlockRow, 'blocker_id' | 'blocked_id'>
      callbacks: Writable<CallbackRow, 'application_id' | 'kind'>
      reports: Writable<ReportRow, 'reporter_id' | 'subject_type' | 'subject_id' | 'reason'>
      casting_invites: Writable<CastingInviteRow, 'casting_call_id' | 'talent_id'>
      events: Writable<EventRow, 'type' | 'entity_type' | 'entity_id'>
      posts: Writable<PostRow, 'author_id' | 'body'>
      post_likes: Writable<PostLikeRow, 'post_id' | 'profile_id'>
      follows: Writable<FollowRow, 'follower_id' | 'following_id'>
      organization_follows: Writable<OrganizationFollowRow, 'profile_id' | 'org_id'>
    }
    Views: {
      v_candidates: ReadOnly<CandidateViewRow>
      v_role_stats: ReadOnly<RoleStatsViewRow>
      v_project_stats: ReadOnly<ProjectStatsViewRow>
      v_profile_network: ReadOnly<ProfileNetworkViewRow>
      v_talent_card: ReadOnly<TalentCardViewRow>
      v_ops_health: ReadOnly<OpsHealthViewRow>
      v_talent_memory: ReadOnly<TalentMemoryViewRow>
      v_production_memory: ReadOnly<ProductionMemoryViewRow>
    }
    Functions: {
      accept_organization_invite: {
        Args: { p_token: string }
        Returns: string
      }
      transfer_organization_ownership: {
        Args: { p_org: string; p_to: string }
        Returns: void
      }
      admin_set_report_status: {
        Args: { p_report: string; p_status: string; p_resolution: string | null }
        Returns: void
      }
      admin_set_organization_status: {
        Args: { p_org: string; p_status: string; p_reason: string }
        Returns: void
      }
      admin_set_user_suspended: {
        Args: { p_profile: string; p_suspended: boolean; p_reason: string }
        Returns: void
      }
      missing_for_application: {
        Args: { p_talent: string }
        Returns: string[]
      }
      can_message: {
        Args: { p_other: string }
        Returns: boolean
      }
      export_my_data: {
        Args: Record<string, never>
        Returns: unknown
      }
      request_account_deletion: {
        Args: { p_reason: string | null }
        Returns: void
      }
      intelligence_feed: {
        Args: { p_casting: string }
        Returns: IntelligenceFeedRow[]
      }
      record_review_engagement: {
        Args: { p_application: string; p_kind: string; p_progress: number | null }
        Returns: void
      }
      record_profile_view: {
        Args: { p_talent: string }
        Returns: void
      }
    }
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
      role_status: RoleStatus
      application_status: ApplicationStatus
      review_vote: ReviewVote
      media_kind: MediaKind
      note_visibility: NoteVisibility
      conversation_context: ConversationContext
      availability_status: AvailabilityStatus
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
