import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { DEMO_PASSWORD, localEnv, signInAs } from './env'

/**
 * Le fil social : ce que publient les gens.
 *
 * Publier, être vu par ceux qui vous suivent, être aimé — et ne pas être vu par
 * ceux qui ne vous suivent pas tant qu'ils ne sont pas passés par la découverte.
 */
test('a post reaches the people who follow its author, and likes are counted', async ({
  page,
  browser,
}) => {
  const stamp = Date.now()
  const env = localEnv()
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  async function makeTalent(label: string) {
    const email = `e2e.post.${label}.${stamp}@letitcast.dev`
    const { data } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: label, last_name: 'Post' },
    })
    const id = data!.user.id
    await admin
      .from('profiles')
      .update({
        account_type: 'talent',
        first_name: label,
        last_name: 'Post',
        onboarding_step: null,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', id)
    await admin
      .from('talent_profiles')
      .upsert({ profile_id: id, headline: `${label} on stage` }, { onConflict: 'profile_id' })
    return { id, email, name: `${label} Post` }
  }

  const author = await makeTalent('Author')
  const follower = await makeTalent('Follower')
  const body = `Wrapped on a short film today ${stamp}`

  // ── L'auteur publie ──
  await signInAs(page, author.email, 'talent')
  await page.getByRole('button', { name: /Share something with your network/ }).click()
  await page.getByLabel('New post').fill(body)
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText(body)).toBeVisible({ timeout: 20_000 })

  const { data: posts } = await admin.from('posts').select('id, author_id').eq('body', body)
  expect(posts).toHaveLength(1)
  expect(posts![0].author_id).toBe(author.id)

  // ── Quelqu'un qui ne le suit pas ne le voit pas dans son réseau ──
  const followerContext = await browser.newContext()
  const followerPage = await followerContext.newPage()
  await signInAs(followerPage, follower.email, 'talent')
  await followerPage.getByRole('radio', { name: 'People' }).click()
  await expect(followerPage.getByText(body)).toHaveCount(0)

  // ── Il suit l'auteur : la publication arrive ──
  await admin.from('follows').insert({ follower_id: follower.id, following_id: author.id })
  await followerPage.reload()
  await followerPage.getByRole('radio', { name: 'People' }).click()
  await expect(followerPage.getByText(body)).toBeVisible({ timeout: 20_000 })

  // ── Le like est compté sur les lignes, et l'auteur est prévenu ──
  await followerPage.getByRole('button', { name: 'Like' }).first().click()
  await expect(followerPage.getByRole('button', { name: '1 like' })).toBeVisible({
    timeout: 20_000,
  })

  await expect
    .poll(async () => {
      const { data } = await admin.from('post_likes').select('profile_id').eq('post_id', posts![0].id)
      return data?.length ?? 0
    }, { timeout: 20_000 })
    .toBe(1)

  await page.goto('/talent/notifications')
  await expect(page.getByText('New like').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/Follower Post liked your post/)).toBeVisible()

  // ── L'auteur peut retirer sa publication ──
  await page.goto('/talent')
  await page.getByRole('radio', { name: 'People' }).click()
  await page.getByRole('button', { name: 'Delete this post' }).first().click()
  await expect
    .poll(async () => {
      const { data } = await admin.from('posts').select('id').eq('body', body)
      return data?.length ?? 0
    }, { timeout: 20_000 })
    .toBe(0)

  await admin.auth.admin.deleteUser(author.id)
  await admin.auth.admin.deleteUser(follower.id)
})
