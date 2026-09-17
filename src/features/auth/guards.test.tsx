import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ProfileRow } from '@/types/database'
import { RequireSurface } from './guards'

/**
 * The guards are the UI half of the access control (the other half is RLS).
 * These tests pin the redirects: a talent must never land in the studio, and an
 * account without a type must finish the onboarding first.
 */

const profile: ProfileRow = {
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
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
}

type MockAuth = {
  ready: boolean
  session: { user: { id: string } } | null
  profile: ProfileRow | null
  profileLoading: boolean
  profileError: string | null
}

let mockAuth: MockAuth

vi.mock('./AuthProvider', () => ({
  useAuth: () => mockAuth,
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/sign-in" element={<p>sign in screen</p>} />
        <Route path="/onboarding" element={<p>onboarding screen</p>} />
        <Route
          path="/studio"
          element={
            <RequireSurface surface="studio">
              <p>studio home</p>
            </RequireSurface>
          }
        />
        <Route
          path="/talent"
          element={
            <RequireSurface surface="talent">
              <p>talent home</p>
            </RequireSurface>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockAuth = {
    ready: true,
    session: { user: { id: 'p1' } },
    profile,
    profileLoading: false,
    profileError: null,
  }
})

describe('RequireSurface', () => {
  it('sends a signed-out visitor to sign in', () => {
    mockAuth.session = null
    mockAuth.profile = null
    renderAt('/talent')
    expect(screen.getByText('sign in screen')).toBeInTheDocument()
  })

  it('waits for the session restore instead of flashing sign-in', () => {
    mockAuth.ready = false
    mockAuth.session = null
    renderAt('/talent')
    expect(screen.queryByText('sign in screen')).not.toBeInTheDocument()
    expect(screen.getByText(/restoring your session/i)).toBeInTheDocument()
  })

  it('lets a talent into the talent space', () => {
    renderAt('/talent')
    expect(screen.getByText('talent home')).toBeInTheDocument()
  })

  it('bounces a talent out of the studio, back to their own surface', () => {
    renderAt('/studio')
    expect(screen.queryByText('studio home')).not.toBeInTheDocument()
    expect(screen.getByText('talent home')).toBeInTheDocument()
  })

  it('lets a production account into the studio', () => {
    mockAuth.profile = { ...profile, account_type: 'production' }
    renderAt('/studio')
    expect(screen.getByText('studio home')).toBeInTheDocument()
  })

  it('sends an account without a type to the onboarding', () => {
    mockAuth.profile = { ...profile, account_type: null }
    renderAt('/studio')
    expect(screen.getByText('onboarding screen')).toBeInTheDocument()
  })

  it('sends an unfinished onboarding back to the wizard', () => {
    mockAuth.profile = { ...profile, onboarding_completed_at: null, onboarding_step: 'casting' }
    renderAt('/talent')
    expect(screen.queryByText('talent home')).not.toBeInTheDocument()
    expect(screen.getByText('onboarding screen')).toBeInTheDocument()
  })

  it('shows a recoverable error when the profile cannot be loaded', () => {
    mockAuth.profileError = 'network down'
    renderAt('/talent')
    expect(screen.getByText(/could not load your profile/i)).toBeInTheDocument()
  })
})
