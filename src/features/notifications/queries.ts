import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { NotificationRow } from '@/types/database'

/**
 * Notifications are written by database triggers (see the notifications
 * migration): a row here always corresponds to a real event — an application
 * received, a status decided, a message sent.
 */

export async function listNotifications(profileId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', profileId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data ?? []
}

export function useNotifications(profileId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', profileId],
    queryFn: () => listNotifications(profileId as string),
    enabled: Boolean(profileId),
  })
}

export function useNotificationMutations(profileId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications', profileId] })
    void queryClient.invalidateQueries({ queryKey: ['unread-counts', profileId] })
  }

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', profileId as string)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { markRead, markAllRead }
}

/** Badge counts for the app shells — one query, both numbers. */
export function useUnreadCounts(profileId: string | undefined) {
  return useQuery({
    queryKey: ['unread-counts', profileId],
    queryFn: async () => {
      const [notificationsRes, membershipsRes] = await Promise.all([
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_id', profileId as string)
          .is('read_at', null),
        supabase
          .from('conversation_members')
          .select('conversation_id, last_read_at')
          .eq('profile_id', profileId as string),
      ])
      if (notificationsRes.error) throw notificationsRes.error
      if (membershipsRes.error) throw membershipsRes.error

      const memberships = membershipsRes.data ?? []
      let messages = 0

      if (memberships.length > 0) {
        const { data, error } = await supabase
          .from('messages')
          .select('conversation_id, sender_id, created_at')
          .in(
            'conversation_id',
            memberships.map((row) => row.conversation_id),
          )
          .neq('sender_id', profileId as string)
          .order('created_at', { ascending: false })
          .limit(500)
        if (error) throw error

        const readAt = new Map(memberships.map((row) => [row.conversation_id, row.last_read_at]))
        messages = (data ?? []).filter((message) => {
          const since = readAt.get(message.conversation_id)
          return !since || message.created_at > since
        }).length
      }

      return { notifications: notificationsRes.count ?? 0, messages }
    },
    enabled: Boolean(profileId),
    staleTime: 20_000,
  })
}
