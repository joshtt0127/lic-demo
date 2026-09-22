import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Check, CheckCheck, MessageCircle, Search, Send } from 'lucide-react'
import { Avatar, Button, Card, FormError, Input, Spinner, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  participantName,
  useConversationContext,
  useConversations,
  useMessages,
  useMessagingMutations,
  type ConversationSummary,
} from '@/features/messaging/queries'
import { formatTime, relativeTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/**
 * Messaging screen, shared by both surfaces: the same conversations, the same
 * rows. Unread comes from `conversation_members.last_read_at`, and opening a
 * thread marks it read for this account everywhere.
 */
export function MessagesScreen() {
  const t = useT()
  const { profile } = useAuth()
  const profileId = profile?.id
  const isProduction = profile?.account_type === 'production'
  const conversations = useConversations(profileId)
  const { send, markRead } = useMessagingMutations(profileId)

  // Arriving from "Message <actor>" opens that thread straight away.
  const [params, setParams] = useSearchParams()
  const [activeId, setActiveId] = useState<string | null>(params.get('conversation'))
  // Below `lg` the two panes take turns: the list, then the thread.
  const [showThread, setShowThread] = useState(Boolean(params.get('conversation')))
  const items = conversations.data ?? []
  const active = items.find((conversation) => conversation.id === activeId) ?? items[0] ?? null
  const messages = useMessages(active?.id)

  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // Opening a conversation clears its badge — and so does a message that
  // arrives while the thread is already open (live, see useLiveMessaging).
  useEffect(() => {
    if (!active || active.unread === 0) return
    markRead.mutate(active.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.unread])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages.data?.length])

  // The deep link has done its job once the thread is open.
  useEffect(() => {
    if (!params.get('conversation')) return
    const next = new URLSearchParams(params)
    next.delete('conversation')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!active || !draft.trim()) return
    setError(null)
    try {
      await send.mutateAsync({ conversationId: active.id, body: draft })
      setDraft('')
    } catch (sendError) {
      setError(errorMessage(sendError, t('messages.sendFailed')))
    }
  }

  if (conversations.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-40" />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  if (conversations.error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-[1.6rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[1.9rem]">
          Messages
        </h1>
        <FormError>
          {errorMessage(conversations.error, t('messages.loadFailed'))}
        </FormError>
        <Button
          variant="secondary"
          size="sm"
          className="w-fit"
          onClick={() => conversations.refetch()}
        >
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-[1.6rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[1.9rem]">
          Messages
        </h1>
        <EmptyState
          icon={<MessageCircle className="h-5 w-5" />}
          title={t('messages.empty')}
          description={
            isProduction
              ? 'Open an actor’s profile, or a candidate in a casting, and use Message — the thread lands here.'
              : t('messages.emptyTalent')
          }
          action={
            isProduction ? (
              <Link
                to="/studio/talent"
                className="inline-flex h-10 items-center gap-1.5 rounded-field bg-ink px-4 text-[14px] font-bold text-white"
              >
                <Search className="h-4 w-4" />
                Find an actor
              </Link>
            ) : (
              <Link
                to="/talent/casting-calls"
                className="inline-flex h-10 items-center rounded-field bg-ink px-4 text-[14px] font-bold text-white"
              >
                {t('messages.browse')}
              </Link>
            )
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[1.6rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[1.9rem]">
        {t('messages.title')}
      </h1>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ── Conversation list ── */}
        <Card flush className={cn('overflow-hidden', showThread && 'hidden lg:block')}>
          <ul className="flex max-h-[70vh] flex-col divide-y divide-line overflow-y-auto">
            {items.map((conversation) => {
              const other = conversation.participants[0]
              const isActive = conversation.id === active?.id
              return (
                <li key={conversation.id}>
                  <button
                    onClick={() => {
                      setActiveId(conversation.id)
                      setShowThread(true)
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors',
                      isActive ? 'bg-paper' : 'hover:bg-paper/70',
                    )}
                  >
                    <Avatar
                      src={other?.avatar_url ?? undefined}
                      name={participantName(other)}
                      size="md"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14px] font-bold text-ink">
                          {participantName(other)}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted">
                          {relativeTime(conversation.lastMessageAt, t)}
                        </span>
                      </span>
                      {conversation.subject && (
                        <span className="block truncate text-[12px] text-muted">
                          {conversation.subject}
                        </span>
                      )}
                      <span
                        className={cn(
                          'mt-0.5 block truncate text-[13px]',
                          conversation.unread > 0 ? 'font-semibold text-ink' : 'text-muted',
                        )}
                      >
                        {conversation.lastMessage?.sender_id === profileId
                          ? `${t('messages.you')} `
                          : ''}
                        {conversation.lastMessage?.body ?? t('messages.none')}
                      </span>
                    </span>
                    {conversation.unread > 0 && (
                      <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-signal-no px-1.5 font-mono text-[10px] font-bold text-white">
                        {conversation.unread}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        {/* ── Thread ── */}
        <Card flush className={cn('flex flex-col overflow-hidden', !showThread && 'hidden lg:flex')}>
          {active && (
            <>
              <header className="flex items-center gap-3 border-b border-line px-5 py-4">
                <button
                  onClick={() => setShowThread(false)}
                  aria-label={t('messages.back')}
                  className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink lg:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <Avatar
                  src={active.participants[0]?.avatar_url ?? undefined}
                  name={participantName(active.participants[0])}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-ink">
                    {participantName(active.participants[0])}
                  </p>
                  {active.subject && (
                    <p className="truncate text-[12px] text-muted">{active.subject}</p>
                  )}
                </div>
                <ContextLink conversation={active} isProduction={isProduction} />
              </header>

              <div
                ref={threadRef}
                className="flex max-h-[52vh] min-h-[320px] flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5"
              >
                {messages.isLoading ? (
                  <Skeleton className="h-20" />
                ) : (
                  (messages.data ?? []).map((message) => {
                    const mine = message.sender_id === profileId
                    return (
                      <div
                        key={message.id}
                        className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[80%] rounded-card px-3.5 py-2.5 text-[14px] leading-relaxed',
                            mine
                              ? 'bg-ink text-white'
                              : 'border border-line bg-paper text-ink',
                          )}
                        >
                          {message.body}
                        </div>
                        <span className="flex items-center gap-1 px-1 text-[11px] text-muted">
                          {formatTime(message.created_at)}
                          {mine &&
                            (active.othersLastReadAt &&
                            active.othersLastReadAt >= message.created_at ? (
                              <>
                                <CheckCheck className="h-3 w-3" />
                                {t('messages.read')}
                              </>
                            ) : (
                              <>
                                <Check className="h-3 w-3" />
                                {t('messages.sent')}
                              </>
                            ))}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>

              <form onSubmit={submit} className="border-t border-line px-4 py-3">
                {error && (
                  <div className="mb-2">
                    <FormError>{error}</FormError>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t('messages.write')}
                    className="flex-1"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || send.isPending}
                    aria-label={t('messages.send')}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn bg-ink text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
                  >
                    {send.isPending ? <Spinner /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

/**
 * What this thread is about, with a way back to it — the casting for the
 * production, the audition for the talent.
 */
function ContextLink({
  conversation,
  isProduction,
}: {
  conversation: ConversationSummary
  isProduction: boolean
}) {
  const context = useConversationContext(conversation.contextType, conversation.contextId)
  if (!context.data) return null

  const href = isProduction ? context.data.studioHref : context.data.talentHref
  return (
    <Link
      to={href}
      className="ml-auto hidden min-h-[36px] shrink-0 items-center gap-1.5 rounded-btn px-1.5 transition-colors hover:bg-paper sm:inline-flex"
      title={[context.data.label, context.data.detail].filter(Boolean).join(' — ')}
    >
      <Tag tone="link" className="max-w-[14rem] truncate">
        {context.data.label}
      </Tag>
      <ArrowUpRight className="h-3.5 w-3.5 text-link" />
    </Link>
  )
}
