import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Launcher } from './pages/Launcher'
import { Pitch } from './pages/Pitch'
import { SignIn } from './pages/auth/SignIn'
import { SignUp } from './pages/auth/SignUp'
import { ForgotPassword } from './pages/auth/ForgotPassword'
import { ResetPassword } from './pages/auth/ResetPassword'
import { Continue } from './pages/auth/Continue'
import { Onboarding } from './pages/onboarding/Onboarding'
import { PublicCastingPage } from './pages/PublicCastingPage'
import { RedirectIfSignedIn, RequireAuth, RequireSurface } from './features/auth/guards'
import { MessagesScreen } from './features/messaging/MessagesScreen'
import { NotificationsScreen } from './features/notifications/NotificationsScreen'
import { StudioLayout } from './studio/StudioLayout'
import { StudioHome } from './studio/StudioHome'
import { CastingCallsPage } from './studio/CastingCallsPage'
import { NewCastingPage } from './studio/NewCastingPage'
import { SelectionConsolePage } from './studio/SelectionConsolePage'
import { CastingDashboardPage } from './studio/CastingDashboardPage'
import { ProjectsPage } from './studio/ProjectsPage'
import { TalentRecruiterPage } from './studio/TalentRecruiterPage'
import { StudioTalentProfilePage } from './studio/StudioTalentProfilePage'
import { CalendarPage } from './studio/CalendarPage'
import { TeamPage } from './studio/TeamPage'
import { SettingsPage } from './studio/SettingsPage'
import { TalentLayout } from './talent/TalentLayout'
import { PhonePreview } from './pages/PhonePreview'
import { TalentHome } from './talent/TalentHome'
import { TalentProfilePage } from './talent/TalentProfilePage'
import { CastingCalls } from './talent/CastingCalls'
import { TalentAuditions } from './talent/TalentAuditions'
import { Messages } from './talent/Messages'
import { Notifications } from './talent/Notifications'
import { TalentCastingDetail } from './talent/TalentCastingDetail'

/**
 * Routes.
 *
 * Only screens backed by real data are mounted. The former fixture screens
 * (`studio/SelectionConsole`, `studio/Dashboard`, `app/*`…) stay in the repo as
 * the base for the slices that will connect them, but they are not reachable —
 * a route that shows invented numbers is worse than no route.
 */
export const router = createBrowserRouter([
  { path: '/', element: <Launcher /> },
  { path: '/pitch', element: <Pitch /> },
  { path: '/app', element: <PhonePreview /> },

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

  // A casting call opened from a shared link — any signed-in account.
  {
    path: '/casting/:castingId',
    element: <RequireAuth />,
    children: [{ index: true, element: <PublicCastingPage /> }],
  },

  // Common onboarding (account type → the steps of your side).
  {
    path: '/onboarding',
    element: <RequireAuth />,
    children: [{ index: true, element: <Onboarding /> }],
  },

  // ── Production ──
  {
    path: '/studio',
    element: <RequireSurface surface="studio" />,
    children: [
      {
        element: <StudioLayout />,
        children: [
          { index: true, element: <StudioHome /> },
          { path: 'casting-calls', element: <CastingCallsPage /> },
          { path: 'casting-calls/new', element: <NewCastingPage /> },
          { path: 'casting/:castingId', element: <CastingDashboardPage /> },
          { path: 'casting/:castingId/console', element: <SelectionConsolePage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'talent', element: <TalentRecruiterPage /> },
          { path: 'talent/:profileId', element: <StudioTalentProfilePage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'messages', element: <MessagesScreen /> },
          { path: 'notifications', element: <NotificationsScreen base="/studio" /> },
          { path: 'team', element: <TeamPage /> },
          { path: 'settings', element: <SettingsPage /> },
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
        element: <TalentLayout />,
        children: [
          { index: true, element: <TalentHome /> },
          { path: 'casting-calls', element: <CastingCalls /> },
          { path: 'auditions', element: <TalentAuditions /> },
          { path: 'messages', element: <Messages /> },
          { path: 'notifications', element: <Notifications /> },
          { path: 'profile', element: <TalentProfilePage /> },
          { path: 'casting/:castingId', element: <TalentCastingDetail /> },
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
