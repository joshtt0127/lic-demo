import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Launcher } from './pages/Launcher'
import { SignIn } from './pages/auth/SignIn'
import { SignUp } from './pages/auth/SignUp'
import { ForgotPassword } from './pages/auth/ForgotPassword'
import { ResetPassword } from './pages/auth/ResetPassword'
import { Continue } from './pages/auth/Continue'
import { RedirectIfSignedIn, RequireAuth, RequireSurface } from './features/auth/guards'

/**
 * Routes.
 *
 * Only screens backed by real data are mounted. The former fixture screens
 * (`studio/Dashboard`, `studio/SelectionConsole`, `app/*`…) stay in the repo as
 * the base for the slices that will connect them, but they are not reachable —
 * a route that shows invented numbers is worse than no route.
 *
 * **Loading**: the landing page and the auth screens ship in the first chunk,
 * because that is what a first visit needs. Everything else is behind
 * `lazy`, so a talent never downloads the studio (and the other way round), and
 * heavy libraries (recharts, framer-motion-driven pages) only arrive with the
 * screen that uses them. React Router resolves these before rendering the
 * route, so there is no flash of an empty layout.
 */
export const router = createBrowserRouter([
  { path: '/', element: <Launcher /> },
  {
    path: '/pitch',
    lazy: async () => ({ Component: (await import('./pages/Pitch')).Pitch }),
  },
  {
    path: '/app',
    lazy: async () => ({ Component: (await import('./pages/PhonePreview')).PhonePreview }),
  },

  // Auth — signed-in users are bounced to their own space.
  {
    path: '/auth',
    element: <RedirectIfSignedIn />,
    children: [
      { index: true, element: <Navigate to="/auth/sign-in" replace /> },
      { path: 'sign-in', element: <SignIn /> },
      { path: 'sign-up', element: <SignUp /> },
      { path: 'forgot-password', element: <ForgotPassword /> },
    ],
  },
  // Password recovery arrives with a live session, so it stays outside the guard.
  { path: '/auth/reset-password', element: <ResetPassword /> },

  // Hand-off after sign-in / sign-up.
  {
    path: '/continue',
    element: <RequireAuth />,
    children: [{ index: true, element: <Continue /> }],
  },

  // Une annonce partagée se lit **sans compte** : c'est ce qui fait vivre le
  // partage et la découverte. Les policies `anon` bornent ce qui est lisible.
  {
    path: '/casting/:castingId',
    lazy: async () => ({
      Component: (await import('./pages/PublicCastingPage')).PublicCastingPage,
    }),
  },

  // Le lien d'invitation reçu par e-mail : il survit au détour par la connexion.
  {
    path: '/invite/:token',
    element: <RequireAuth />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('./pages/InviteAcceptPage')).InviteAcceptPage,
        }),
      },
    ],
  },

  // Common onboarding (account type → the steps of your side).
  {
    path: '/onboarding',
    element: <RequireAuth />,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('./pages/onboarding/Onboarding')).Onboarding }),
      },
    ],
  },

  // ── Production ──
  {
    path: '/studio',
    element: <RequireSurface surface="studio" />,
    children: [
      {
        lazy: async () => ({ Component: (await import('./studio/StudioLayout')).StudioLayout }),
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('./studio/StudioHome')).StudioHome }),
          },
          {
            path: 'casting-calls',
            lazy: async () => ({
              Component: (await import('./studio/CastingCallsPage')).CastingCallsPage,
            }),
          },
          {
            path: 'casting-calls/new',
            lazy: async () => ({
              Component: (await import('./studio/NewCastingPage')).NewCastingPage,
            }),
          },
          {
            path: 'casting/:castingId',
            lazy: async () => ({
              Component: (await import('./studio/CastingDashboardPage')).CastingDashboardPage,
            }),
          },
          {
            path: 'casting/:castingId/console',
            lazy: async () => ({
              Component: (await import('./studio/SelectionConsolePage')).SelectionConsolePage,
            }),
          },
          {
            path: 'projects',
            lazy: async () => ({ Component: (await import('./studio/ProjectsPage')).ProjectsPage }),
          },
          {
            path: 'talent',
            lazy: async () => ({
              Component: (await import('./studio/TalentRecruiterPage')).TalentRecruiterPage,
            }),
          },
          {
            path: 'talent/:profileId',
            lazy: async () => ({
              Component: (await import('./studio/StudioTalentProfilePage')).StudioTalentProfilePage,
            }),
          },
          {
            path: 'reports',
            lazy: async () => ({ Component: (await import('./studio/ReportsPage')).ReportsPage }),
          },
          {
            path: 'calendar',
            lazy: async () => ({ Component: (await import('./studio/CalendarPage')).CalendarPage }),
          },
          {
            path: 'messages',
            lazy: async () => ({
              Component: (await import('./features/messaging/MessagesScreen')).MessagesScreen,
            }),
          },
          {
            path: 'notifications',
            lazy: async () => {
              const { NotificationsScreen } = await import(
                './features/notifications/NotificationsScreen'
              )
              return { Component: () => <NotificationsScreen base="/studio" /> }
            },
          },
          {
            path: 'team',
            lazy: async () => ({ Component: (await import('./studio/TeamPage')).TeamPage }),
          },
          {
            path: 'settings',
            lazy: async () => ({ Component: (await import('./studio/SettingsPage')).SettingsPage }),
          },
          // The old fixture dashboard lived here; the casting list is its real
          // equivalent, and a casting call has its own dashboard.
          { path: 'dashboard', element: <Navigate to="/studio/casting-calls" replace /> },
          { path: 'search', element: <Navigate to="/studio/talent" replace /> },
          { path: '*', element: <Navigate to="/studio" replace /> },
        ],
      },
    ],
  },

  // ── Talent ──
  {
    path: '/talent',
    element: <RequireSurface surface="talent" />,
    children: [
      {
        lazy: async () => ({ Component: (await import('./talent/TalentLayout')).TalentLayout }),
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('./talent/TalentHome')).TalentHome }),
          },
          {
            path: 'casting-calls',
            lazy: async () => ({ Component: (await import('./talent/CastingCalls')).CastingCalls }),
          },
          {
            path: 'auditions',
            lazy: async () => ({
              Component: (await import('./talent/TalentAuditions')).TalentAuditions,
            }),
          },
          {
            path: 'messages',
            lazy: async () => ({ Component: (await import('./talent/Messages')).Messages }),
          },
          {
            path: 'notifications',
            lazy: async () => ({
              Component: (await import('./talent/Notifications')).Notifications,
            }),
          },
          {
            path: 'profile',
            lazy: async () => ({
              Component: (await import('./talent/TalentProfilePage')).TalentProfilePage,
            }),
          },
          {
            path: 'casting/:castingId',
            lazy: async () => ({
              Component: (await import('./talent/TalentCastingDetail')).TalentCastingDetail,
            }),
          },
          { path: '*', element: <Navigate to="/talent" replace /> },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
], {
  basename: import.meta.env.BASE_URL,
  future: { v7_relativeSplatPath: true },
})
