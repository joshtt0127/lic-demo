import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { TalentProfileFull } from '@/data/repositories/talent'
import { TalentProfilePage } from './TalentProfilePage'

/**
 * The profile must render from database rows only — and must show a real state
 * (loading / error / empty) instead of crashing when a row is missing.
 */

const data: TalentProfileFull = {
  profile: {
    id: 'p1',
    account_type: 'talent',
    first_name: 'Maya',
    last_name: 'Reyes',
    avatar_url: null,
    locale: 'en',
    city: 'Los Angeles',
    country: 'US',
    onboarding_step: null,
    onboarding_completed_at: '2026-09-01T10:00:00Z',
    created_at: '',
    updated_at: '',
  },
  talent: {
    profile_id: 'p1',
    professional_name: null,
    headline: 'Actress · SAG-AFTRA',
    bio: 'Trained at Juilliard.',
    cover_url: null,
    gender: 'Female',
    ethnicities: ['Latino / Hispanic'],
    playing_age_min: 24,
    playing_age_max: 34,
    height_cm: 170,
    nationalities: ['American'],
    accents: ['Standard American'],
    union_name: 'SAG-AFTRA',
    experience_level: 'Mid-career',
    availability: 'available',
    website: null,
    agency_name: 'Vertice Talent',
    agent_name: 'Naomi Cross',
    agent_email: 'naomi@vertice.test',
    agent_phone: null,
    created_at: '',
    updated_at: '',
  },
  skills: [{ skillId: 's1', name: 'Stage combat', category: 'stunts', level: 3 }],
  languages: [{ code: 'en', name: 'English', fluency: null }],
  credits: [
    {
      id: 'c1',
      talent_id: 'p1',
      title: 'Evermore',
      role_name: 'Fanny Brice',
      category: 'Series',
      year: '2026',
      director: 'Lara Khan',
      company: 'A24',
      location: 'Los Angeles',
      url: null,
      sort_order: 0,
      created_at: '',
    },
  ],
  training: [],
  media: [],
}

const state = {
  profileQuery: { data, isLoading: false, error: null } as {
    data: TalentProfileFull | null
    isLoading: boolean
    error: unknown
  },
}

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ profile: data.profile, user: { email: 'maya@example.test' } }),
}))

const noopMutation = { mutateAsync: vi.fn(), isPending: false }

vi.mock('@/features/talent/queries', () => ({
  useTalentProfile: () => state.profileQuery,
  useUpdateAccountProfile: () => noopMutation,
  useUpdateTalentProfile: () => noopMutation,
  useTalentSkillMutations: () => ({
    add: noopMutation,
    setLevel: noopMutation,
    remove: noopMutation,
  }),
  useCreditMutations: () => ({ create: noopMutation, update: noopMutation, remove: noopMutation }),
  useTrainingMutations: () => ({ create: noopMutation, update: noopMutation, remove: noopMutation }),
  useSetTalentLanguages: () => noopMutation,
  useSkillsCatalog: () => ({ data: [] }),
  useLanguagesCatalog: () => ({ data: [{ code: 'en', name: 'English' }] }),
  useMediaMutations: () => ({ upload: noopMutation, update: noopMutation, remove: noopMutation }),
}))

vi.mock('@/features/applications/queries', () => ({
  useTalentApplicationStats: () => ({
    data: { total: 3, submitted: 3, shortlisted: 1, booked: 0 },
    isLoading: false,
  }),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <TalentProfilePage />
    </MemoryRouter>,
  )
}

describe('TalentProfilePage', () => {
  it('renders the profile from database rows', () => {
    state.profileQuery = { data, isLoading: false, error: null }
    renderPage()

    expect(screen.getByRole('heading', { name: 'Maya Reyes' })).toBeInTheDocument()
    expect(screen.getByText('Actress · SAG-AFTRA')).toBeInTheDocument()
    expect(screen.getByText('Trained at Juilliard.')).toBeInTheDocument()
    expect(screen.getByText('Stage combat')).toBeInTheDocument()
    expect(screen.getByText('24–34')).toBeInTheDocument()
    expect(screen.getByText(/Fanny Brice/)).toBeInTheDocument()
    expect(screen.getByText('Vertice Talent')).toBeInTheDocument()
  })

  it('shows the real application counters, not decorative numbers', () => {
    state.profileQuery = { data, isLoading: false, error: null }
    renderPage()

    expect(screen.getByText('Auditions sent')).toBeInTheDocument()
    expect(screen.getByText('Shortlisted')).toBeInTheDocument()
    expect(screen.getByText('Booked')).toBeInTheDocument()
  })

  it('shows profile strength with what is still missing', () => {
    state.profileQuery = { data, isLoading: false, error: null }
    renderPage()

    expect(screen.getByText('Profile strength')).toBeInTheDocument()
    // No photo and no media on this fixture.
    expect(screen.getByText('Profile photo')).toBeInTheDocument()
  })

  it('shows a skeleton while loading', () => {
    state.profileQuery = { data: null, isLoading: true, error: null }
    const { container } = renderPage()
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows an error instead of crashing when the profile cannot be read', () => {
    state.profileQuery = { data: null, isLoading: false, error: new Error('row not found') }
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('row not found')
  })
})
