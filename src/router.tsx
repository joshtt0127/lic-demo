import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Launcher } from './pages/Launcher'
import { Pitch } from './pages/Pitch'
import { SignIn } from './pages/auth/SignIn'
import { SignUp } from './pages/auth/SignUp'
import { ForgotPassword } from './pages/auth/ForgotPassword'
import { ResetPassword } from './pages/auth/ResetPassword'
import { Onboarding } from './pages/onboarding/Onboarding'
import { RedirectIfSignedIn, RequireAuth, RequireSurface } from './features/auth/guards'
import { StudioLayout } from './studio/StudioLayout'
import { HomeFeed } from './studio/HomeFeed'
import { CommandCenter } from './studio/CommandCenter'
import { Dashboard } from './studio/Dashboard'
import { SearchScreen } from './studio/SearchScreen'
import { Review } from './studio/Review'
import { NewCasting } from './studio/NewCasting'
import { CastingRecap } from './studio/CastingRecap'
import { AgencySelect } from './studio/AgencySelect'
import { CastingSearch } from './studio/CastingSearch'
import { SelectionConsole } from './studio/SelectionConsole'
import { StudioTalentProfile } from './studio/StudioTalentProfile'
import { Wall } from './studio/Wall'
import { AppLayout } from './app/AppLayout'
import { Discover } from './app/Discover'
import { Profile } from './app/Profile'
import { CastingDetail } from './app/CastingDetail'
import { SelfTape } from './app/SelfTape'
import { Auditions } from './app/Auditions'
import { SnapApplyTips } from './app/SnapApplyTips'
import { MobileFeed } from './app/MobileFeed'
import { TalentDesktopLayout } from './talent/TalentDesktopLayout'
import { TalentProfilePage } from './talent/TalentProfilePage'
import { CastingCalls } from './talent/CastingCalls'
import { TalentAuditions } from './talent/TalentAuditions'
import { Messages } from './talent/Messages'
import { Notifications } from './talent/Notifications'
import { TalentCastingDetail } from './talent/TalentCastingDetail'

export const router = createBrowserRouter([
  { path: '/', element: <Launcher /> },
  { path: '/pitch', element: <Pitch /> },

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

  // Common onboarding (account type → identity), resumed from the profile state.
  {
    path: '/onboarding',
    element: <RequireAuth />,
    children: [{ index: true, element: <Onboarding /> }],
  },

  // Production (web / desktop)
  {
    path: '/studio',
    element: <RequireSurface surface="studio" />,
    children: [
      {
        element: <StudioLayout />,
        children: [
          { index: true, element: <CommandCenter /> },
          { path: 'dashboard', element: <Dashboard /> },
          { path: 'search', element: <SearchScreen /> },
          { path: 'review', element: <Review /> },
          { path: 'new-casting', element: <NewCasting /> },
          { path: 'casting-recap', element: <CastingRecap /> },
          { path: 'agency-select', element: <AgencySelect /> },
          { path: 'casting-search', element: <CastingSearch /> },
          { path: 'selection', element: <SelectionConsole /> },
          { path: 'talent/:candidateId', element: <StudioTalentProfile /> },
          { path: 'wall', element: <Wall /> },
        ],
      },
    ],
  },

  // Talent (mobile, inside phone frame)
  {
    path: '/app',
    element: <RequireSurface surface="talent" />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Discover /> },
          { path: 'profile', element: <Profile /> },
          { path: 'casting/:id', element: <CastingDetail /> },
          { path: 'selftape/:id', element: <SelfTape /> },
          { path: 'feed', element: <MobileFeed /> },
          { path: 'auditions', element: <Auditions /> },
          { path: 'tips', element: <SnapApplyTips /> },
        ],
      },
    ],
  },

  // Talent (web / desktop — LinkedIn-style space)
  {
    path: '/talent',
    element: <RequireSurface surface="talent" />,
    children: [
      {
        element: <TalentDesktopLayout />,
        children: [
          { index: true, element: <HomeFeed /> },
          { path: 'casting-calls', element: <CastingCalls /> },
          { path: 'auditions', element: <TalentAuditions /> },
          { path: 'messages', element: <Messages /> },
          { path: 'notifications', element: <Notifications /> },
          { path: 'profile', element: <TalentProfilePage /> },
          { path: 'casting/:projectId', element: <TalentCastingDetail /> },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
], {
  basename: import.meta.env.BASE_URL,
  future: { v7_relativeSplatPath: true },
})
