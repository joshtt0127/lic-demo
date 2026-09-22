import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { conversationsKey } from '@/features/messaging/queries'

/**
 * Keeps messages and badges live.
 *
 * Realtime applies the same RLS policies as a normal read, so a client is only
 * told about rows it could have fetched itself: a message in one of its
 * conversations, or a notification addressed to it. We do not push the payload
 * into the cache — we invalidate and let the normal queries refetch, so there is
 * exactly one shape of truth on screen.
 *
 * Mounted once per app shell (talent and studio).
 */
export function useLiveMessaging(profileId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!profileId) return

    const invalidate = (conversationId?: string) => {
      void queryClient.invalidateQueries({ queryKey: conversationsKey(profileId) })
      void queryClient.invalidateQueries({ queryKey: ['unread-counts', profileId] })
      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      }
    }

    const channel = supabase
      .channel(`live-inbox-${profileId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => invalidate((payload.new as { conversation_id?: string }).conversation_id),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['notifications', profileId] })
        void queryClient.invalidateQueries({ queryKey: ['unread-counts', profileId] })
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
        () => invalidate(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [profileId, queryClient])
}
