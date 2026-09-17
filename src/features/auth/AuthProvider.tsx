import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session, User } from '@supabase/supabase-js'
import {
  errorMessage,
  isSupabaseConfigured,
  setSessionPersistence,
  supabase,
} from '@/lib/supabase'
import type { AccountType, ProfileRow } from '@/types/database'

/**
 * Session + profile, available everywhere.
 *
 * The Supabase client persists the session itself (localStorage), so a refresh
 * or a new tab restores it: `ready` flips to true once that restore settled and
 * the guards can decide without flashing the wrong screen.
 */

type Result = { error: string | null }

export type SignUpInput = {
  email: string
  password: string
  firstName: string
  lastName: string
  accountType?: AccountType
}

type AuthValue = {
  /** Session restore finished — guards must wait for this. */
  ready: boolean
  session: Session | null
  user: User | null
  profile: ProfileRow | null
  profileLoading: boolean
  profileError: string | null
  signUp: (input: SignUpInput) => Promise<Result>
  signIn: (input: { email: string; password: string; keepSignedIn?: boolean }) => Promise<Result>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<Result>
  updatePassword: (password: string) => Promise<Result>
  /** Sets the account type and creates the matching side profile row. */
  setAccountType: (accountType: AccountType) => Promise<Result>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export const PROFILE_QUERY_KEY = 'profile'

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  if (data) return data

  // The `on_auth_user_created` trigger normally creates this row. Insert it
  // defensively so a user can never end up signed in without a profile.
  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: userId })
    .select('*')
    .single()

  if (insertError) throw insertError
  return inserted
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setReady(true)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const user = session?.user ?? null
  const userId = user?.id

  const profileQuery = useQuery({
    queryKey: [PROFILE_QUERY_KEY, userId],
    queryFn: () => fetchProfile(userId as string),
    enabled: Boolean(userId) && isSupabaseConfigured,
    staleTime: 30_000,
  })

  const refreshProfile = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [PROFILE_QUERY_KEY] })
  }, [queryClient])

  const signUp = useCallback(async (input: SignUpInput): Promise<Result> => {
    const { error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: {
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          ...(input.accountType ? { account_type: input.accountType } : {}),
        },
      },
    })
    if (error) return { error: errorMessage(error, 'Could not create your account') }
    return { error: null }
  }, [])

  const signIn = useCallback(
    async ({
      email,
      password,
      keepSignedIn = true,
    }: {
      email: string
      password: string
      keepSignedIn?: boolean
    }): Promise<Result> => {
      // Decided before the call so the session is written to the right store.
      setSessionPersistence(keepSignedIn)
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) return { error: errorMessage(error, 'Could not sign you in') }
      return { error: null }
    },
    [],
  )


  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    queryClient.clear()
  }, [queryClient])

  const requestPasswordReset = useCallback(async (email: string): Promise<Result> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}auth/reset-password`,
    })
    if (error) return { error: errorMessage(error, 'Could not send the reset email') }
    return { error: null }
  }, [])

  const updatePassword = useCallback(async (password: string): Promise<Result> => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { error: errorMessage(error, 'Could not update your password') }
    return { error: null }
  }, [])

  const setAccountType = useCallback(
    async (accountType: AccountType): Promise<Result> => {
      if (!userId) return { error: 'You are not signed in' }

      const { error } = await supabase
        .from('profiles')
        .update({ account_type: accountType, onboarding_step: 'identity' })
        .eq('id', userId)
      if (error) return { error: errorMessage(error, 'Could not save your choice') }

      // Create the side profile so every later write is a plain update.
      const { error: sideError } =
        accountType === 'talent'
          ? await supabase
              .from('talent_profiles')
              .upsert({ profile_id: userId }, { onConflict: 'profile_id' })
          : await supabase
              .from('production_profiles')
              .upsert({ profile_id: userId }, { onConflict: 'profile_id' })
      if (sideError) return { error: errorMessage(sideError, 'Could not prepare your profile') }

      await refreshProfile()
      return { error: null }
    },
    [refreshProfile, userId],
  )

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      session,
      user,
      profile: profileQuery.data ?? null,
      profileLoading: profileQuery.isLoading,
      profileError: profileQuery.error ? errorMessage(profileQuery.error) : null,
      signUp,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
      setAccountType,
      refreshProfile,
    }),
    [
      profileQuery.data,
      profileQuery.error,
      profileQuery.isLoading,
      ready,
      refreshProfile,
      requestPasswordReset,
      session,
      setAccountType,
      signIn,
      signOut,
      signUp,
      updatePassword,
      user,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
