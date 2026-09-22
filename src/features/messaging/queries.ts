import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ConversationContext, MessageRow, ProfileRow } from '@/types/database'

/**
 * Messaging — the same conversations for both sides of the marketplace.
 *
 * Unread is derived from `conversation_members.last_read_at`, so it is the same
 * truth on every device; nothing is counted in React state.
 */

export type Participant = Pick<ProfileRow, 'id' | 'first_name' | 'last_name' | 'avatar_url'>

export type ConversationSummary = {
  id: string
  subject: string | null
  contextType: ConversationContext
  contextId: string | null
  lastMessageAt: string
  lastMessage: MessageRow | null
  unread: number
  /**
   * When the other side last opened the thread — that is what makes a "Read"
   * marker honest rather than decorative.
   */
  othersLastReadAt: string | null
  participants: Participant[]
}

export function participantName(participant: Participant | undefined): string {
  if (!participant) return 'Let It Cast'
  return [participant.first_name, participant.last_name].filter(Boolean).join(' ') || 'Member'
}

export async function listConversations(profileId: string): Promise<ConversationSummary[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at')
    .eq('profile_id', profileId)
  if (membershipError) throw membershipError

  const ids = (memberships ?? []).map((row) => row.conversation_id)
  if (ids.length === 0) return []

  const readAt = new Map((memberships ?? []).map((row) => [row.conversation_id, row.last_read_at]))

  const [conversationsRes, participantsRes, messagesRes] = await Promise.all([
    supabase
      .from('conversations')
      .select('*')
      .in('id', ids)
      .order('last_message_at', { ascending: false }),
    supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at, profiles(id, first_name, last_name, avatar_url)')
      .in('conversation_id', ids),
    supabase
      .from('messages')
      .select('*')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  for (const response of [conversationsRes, participantsRes, messagesRes]) {
    if (response.error) throw response.error
  }

  type ParticipantJoin = {
    conversation_id: string
    last_read_at: string | null
    profiles: Participant | null
  }
  const participants = new Map<string, Participant[]>()
  const othersRead = new Map<string, string | null>()
  for (const row of (participantsRes.data ?? []) as unknown as ParticipantJoin[]) {
    if (!row.profiles || row.profiles.id === profileId) continue
    participants.set(row.conversation_id, [
      ...(participants.get(row.conversation_id) ?? []),
      row.profiles,
    ])
    const known = othersRead.get(row.conversation_id) ?? null
    if (row.last_read_at && (!known || row.last_read_at > known)) {
      othersRead.set(row.conversation_id, row.last_read_at)
    }
  }

  const messages = (messagesRes.data ?? []) as MessageRow[]

  return (conversationsRes.data ?? []).map((conversation) => {
    const own = messages.filter((message) => message.conversation_id === conversation.id)
    const since = readAt.get(conversation.id)
    return {
      id: conversation.id,
      subject: conversation.subject,
      contextType: conversation.context_type,
      contextId: conversation.context_id,
      lastMessageAt: conversation.last_message_at,
      lastMessage: own[0] ?? null,
      unread: own.filter(
        (message) =>
          message.sender_id !== profileId && (!since || message.created_at > since),
      ).length,
      othersLastReadAt: othersRead.get(conversation.id) ?? null,
      participants: participants.get(conversation.id) ?? [],
    }
  })
}

export type ThreadMessage = MessageRow & { sender: Participant | null }

export async function listMessages(conversationId: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, profiles!messages_sender_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error

  type Joined = MessageRow & { profiles: Participant | null }
  return ((data ?? []) as unknown as Joined[]).map(({ profiles, ...message }) => ({
    ...message,
    sender: profiles,
  }))
}

export async function sendMessage(input: {
  conversationId: string
  senderId: string
  body: string
}): Promise<MessageRow> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      body: input.body.trim(),
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export type StartConversationInput = {
  /** The person to talk to — a talent, seen from the production side. */
  withProfileId: string
  body: string
  subject?: string | null
  contextType?: ConversationContext
  contextId?: string | null
  orgId?: string | null
}

/**
 * Opens a conversation with someone and sends the first message.
 *
 * A thread is reused only when it is about the same thing (same context, or
 * both direct) — a note about one role must not land in the thread of another.
 * Returns the conversation id so the caller can open it.
 */
export async function startConversation(
  senderId: string,
  input: StartConversationInput,
): Promise<string> {
  const contextType = input.contextType ?? 'direct'

  const { data: mine, error: mineError } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('profile_id', senderId)
  if (mineError) throw mineError

  const myIds = (mine ?? []).map((row) => row.conversation_id)
  let conversationId: string | null = null

  if (myIds.length > 0) {
    const { data: shared, error: sharedError } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('profile_id', input.withProfileId)
      .in('conversation_id', myIds)
    if (sharedError) throw sharedError

    const sharedIds = (shared ?? []).map((row) => row.conversation_id)
    if (sharedIds.length > 0) {
      const { data: candidates, error: candidatesError } = await supabase
        .from('conversations')
        .select('id, context_type, context_id')
        .in('id', sharedIds)
      if (candidatesError) throw candidatesError

      conversationId =
        (candidates ?? []).find(
          (conversation) =>
            conversation.context_type === contextType &&
            (conversation.context_id ?? null) === (input.contextId ?? null),
        )?.id ?? null
    }
  }

  if (!conversationId) {
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        subject: input.subject?.trim() || null,
        context_type: contextType,
        context_id: input.contextId ?? null,
        org_id: input.orgId ?? null,
        created_by: senderId,
      })
      .select('id')
      .single()
    if (conversationError) throw conversationError
    conversationId = conversation.id

    const { error: membersError } = await supabase.from('conversation_members').insert([
      { conversation_id: conversationId, profile_id: senderId },
      { conversation_id: conversationId, profile_id: input.withProfileId },
    ])
    if (membersError) throw membersError
  }

  await sendMessage({ conversationId, senderId, body: input.body })
  return conversationId
}

export type ConversationContextInfo = {
  label: string
  detail: string | null
  /** Where this thread comes from, per surface. */
  talentHref: string
  studioHref: string
}

/**
 * What a conversation is about — resolved from `context_type` / `context_id`,
 * so the thread can link back to the audition or the casting instead of leaving
 * both sides guessing.
 */
export async function getConversationContext(
  contextType: ConversationContext,
  contextId: string | null,
): Promise<ConversationContextInfo | null> {
  if (!contextId) return null

  if (contextType === 'application') {
    const { data, error } = await supabase
      .from('applications')
      .select('id, roles ( name, casting_call_id, casting_calls ( title, projects ( title ) ) )')
      .eq('id', contextId)
      .maybeSingle()
    if (error || !data) return null
    type Joined = {
      roles:
        | { name: string; casting_call_id: string; casting_calls: { title: string; projects: { title: string } | null } | null }
        | null
    }
    const role = (data as unknown as Joined).roles
    if (!role) return null
    return {
      label: role.name,
      detail: role.casting_calls?.projects?.title ?? role.casting_calls?.title ?? null,
      talentHref: '/talent/auditions',
      studioHref: `/studio/casting/${role.casting_call_id}`,
    }
  }

  if (contextType === 'role') {
    const { data, error } = await supabase
      .from('roles')
      .select('name, casting_call_id, casting_calls ( title, projects ( title ) )')
      .eq('id', contextId)
      .maybeSingle()
    if (error || !data) return null
    type Joined = {
      name: string
      casting_call_id: string
      casting_calls: { title: string; projects: { title: string } | null } | null
    }
    const role = data as unknown as Joined
    return {
      label: role.name,
      detail: role.casting_calls?.projects?.title ?? role.casting_calls?.title ?? null,
      talentHref: `/talent/casting/${role.casting_call_id}`,
      studioHref: `/studio/casting/${role.casting_call_id}`,
    }
  }

  if (contextType === 'casting_call') {
    const { data, error } = await supabase
      .from('casting_calls')
      .select('id, title, projects ( title )')
      .eq('id', contextId)
      .maybeSingle()
    if (error || !data) return null
    type Joined = { id: string; title: string; projects: { title: string } | null }
    const casting = data as unknown as Joined
    return {
      label: casting.projects?.title ?? casting.title,
      detail: casting.title,
      talentHref: `/talent/casting/${casting.id}`,
      studioHref: `/studio/casting/${casting.id}`,
    }
  }

  return null
}

export function useConversationContext(
  contextType: ConversationContext | undefined,
  contextId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['conversation-context', contextType, contextId],
    queryFn: () => getConversationContext(contextType as ConversationContext, contextId ?? null),
    enabled: Boolean(contextType && contextType !== 'direct' && contextId),
    staleTime: 5 * 60_000,
  })
}

export async function markConversationRead(conversationId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', profileId)
  if (error) throw error
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export const conversationsKey = (profileId: string | undefined) => ['conversations', profileId]

export function useConversations(profileId: string | undefined) {
  return useQuery({
    queryKey: conversationsKey(profileId),
    queryFn: () => listConversations(profileId as string),
    enabled: Boolean(profileId),
  })
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => listMessages(conversationId as string),
    enabled: Boolean(conversationId),
  })
}

export function useMessagingMutations(profileId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = (conversationId?: string) => {
    void queryClient.invalidateQueries({ queryKey: conversationsKey(profileId) })
    void queryClient.invalidateQueries({ queryKey: ['unread-counts', profileId] })
    if (conversationId) void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
  }

  const send = useMutation({
    mutationFn: (input: { conversationId: string; body: string }) =>
      sendMessage({ ...input, senderId: profileId as string }),
    onSuccess: (_data, variables) => invalidate(variables.conversationId),
  })

  const markRead = useMutation({
    mutationFn: (conversationId: string) =>
      markConversationRead(conversationId, profileId as string),
    onSuccess: (_data, conversationId) => invalidate(conversationId),
  })

  const start = useMutation({
    mutationFn: (input: StartConversationInput) =>
      startConversation(profileId as string, input),
    onSuccess: (conversationId) => invalidate(conversationId),
  })

  return { send, markRead, start }
}
