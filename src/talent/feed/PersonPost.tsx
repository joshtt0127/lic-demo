import { Heart, Trash2 } from 'lucide-react'
import { Avatar, Card } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { relativeTime } from '@/lib/format'
import { asset } from '@/lib/asset'
import { cn } from '@/lib/cn'
import type { Post } from '@/data/repositories/posts'

/**
 * Une publication d'une personne — la brique « réseau social » du fil.
 *
 * Le like est la seule mesure affichée, et elle est comptée sur les lignes :
 * pas de vue, pas de portée, pas de score d'engagement inventé.
 */
export function PersonPost({
  post,
  isMine,
  onToggleLike,
  onDelete,
}: {
  post: Post
  isMine: boolean
  onToggleLike: () => void
  onDelete: () => void
}) {
  const t = useT()
  const name =
    post.author?.professionalName ||
    [post.author?.first_name, post.author?.last_name].filter(Boolean).join(' ') ||
    t('social.someone')

  return (
    <Card flush className="overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-4 sm:px-5">
        <Avatar src={post.author?.avatar_url ?? undefined} name={name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold leading-tight text-ink">
            {name}
          </p>
          {post.author?.headline && (
            <p className="truncate text-[13px] text-muted">{post.author.headline}</p>
          )}
          <p className="mt-0.5 text-[12px] text-muted">{relativeTime(post.createdAt, t)}</p>
        </div>
        {isMine && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={t('social.deletePost')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-signal-no/10 hover:text-signal-no"
          >
            <Trash2 className="h-[17px] w-[17px]" />
          </button>
        )}
      </div>

      <p className="whitespace-pre-line px-4 pb-3.5 pt-3 text-[14px] leading-relaxed text-ink/90 sm:px-5">
        {post.body}
      </p>

      {post.mediaUrl && (
        <div className="border-y border-line bg-paper">
          {post.mediaKind === 'showreel' ? (
            <video src={post.mediaUrl} controls preload="metadata" className="max-h-[26rem] w-full" />
          ) : (
            <img
              src={asset(post.mediaUrl)}
              alt=""
              loading="lazy"
              className="max-h-[26rem] w-full object-cover"
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 py-2 sm:px-3">
        <button
          type="button"
          onClick={onToggleLike}
          aria-pressed={post.likedByMe}
          className={cn(
            'flex h-10 items-center gap-1.5 rounded-btn px-3 text-[13px] font-semibold transition-colors hover:bg-paper',
            post.likedByMe ? 'text-signal-no' : 'text-muted hover:text-ink',
          )}
        >
          <Heart className={cn('h-[18px] w-[18px]', post.likedByMe && 'fill-current')} />
          {post.likes > 0 ? t('social.likes', { count: post.likes }) : t('social.like')}
        </button>
      </div>
    </Card>
  )
}
