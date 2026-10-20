import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './env'

/**
 * The Wall™ — sur la démo « Clem » (`npm run db:seed:wall`).
 *
 * Le test change une sélection, la vide, puis remet le mur exactement comme le
 * seed l'a laissé : la démo reste présentable après chaque passage.
 */

/** Depuis une carte vide : la file du rôle, une audition, « Place on Wall », retour au mur. */
async function placeFromQueue(page: Page, role: string, actor: string) {
  await page.getByRole('article', { name: `${role}, open role` }).getByRole('button', { name: 'Choose an Actor' }).click()
  await expect(page).toHaveURL(/\/review\?role=/)
  await expect(page.getByText(`Choosing an actor for ${role}.`)).toBeVisible()
  await page.getByRole('checkbox', { name: `Select ${actor}` }).check({ force: true })
  await page.getByRole('button', { name: 'Place on Wall' }).click()
  await expect(page.getByText(`${actor} placed on the Wall as ${role}`)).toBeVisible()
  await page.getByRole('button', { name: 'Back to The Wall' }).click()
  await expect(page.locator('h1', { hasText: 'Clem' })).toBeVisible()
}

async function openWall(page: Page) {
  await page.goto('/studio/projects')
  await page.getByRole('link', { name: 'The Wall' }).first().waitFor()
  const card = page.locator('li', { has: page.getByText('Clem', { exact: true }) })
  await card.getByRole('link', { name: 'The Wall' }).click()
  await expect(page.locator('h1', { hasText: 'Clem' })).toBeVisible()
}

test.describe('The Wall™', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'peter@letitcast.demo', 'studio')
  })

  test('une carte par rôle, dans l’ordre d’importance, avec les vrais chiffres', async ({ page }) => {
    await openWall(page)
    const titles = page.locator('article h3')
    await expect(titles).toHaveCount(8)
    await expect(titles).toHaveText([
      'Clem',
      'Alizée',
      'Mademoiselle Lecoutre',
      'Julien',
      'Michel',
      'Maman Parc',
      'La Radiologue',
      'Mélusine',
    ])
    await expect(page.getByText('5 of 8', { exact: true })).toBeVisible()

    // Rôle ouvert : l'action et les chiffres, jamais d'image de remplacement.
    const alizee = page.getByRole('article', { name: 'Alizée, open role' })
    await expect(alizee.getByRole('button', { name: 'Choose an Actor' })).toBeVisible()
    await expect(alizee.getByText('12 auditions · 8 interesting')).toBeVisible()
    await expect(alizee.locator('img')).toHaveCount(0)

    // Aucune audition : pas de file vide, un état clair.
    const melusine = page.getByRole('article', { name: 'Mélusine, open role' })
    await expect(melusine.getByText('No auditions yet')).toBeVisible()

    // Catégories : celles de la production, groupes compris.
    await page.getByRole('tab', { name: /Small Roles/ }).click()
    await expect(titles).toHaveText(['Maman Parc', 'La Radiologue', 'Mélusine'])
    await expect(page).toHaveURL(/view=small/)
    await page.getByRole('tab', { name: /La famille Parc/ }).click()
    await expect(titles).toHaveText(['Clem', 'Julien', 'Michel', 'Maman Parc'])
  })

  test('remplacer, vider, retrouver l’historique — sans rien effacer', async ({ page }) => {
    await openWall(page)
    const card = () => page.locator('article[data-role-id]', { has: page.locator('h3', { hasText: /^Maman Parc$/ }) })
    await expect(card().getByText('Nadia Ferrand')).toBeVisible()

    // Remplacer par une alternative, par une action explicite.
    await card().getByRole('button', { name: 'Selection options for Maman Parc' }).click()
    const menu = page.getByRole('dialog', { name: 'Maman Parc — selection' })
    const sarah = menu.getByRole('listitem').filter({ hasText: 'Sarah Lefèvre' })
    await sarah.getByRole('button', { name: 'Place' }).click()
    await expect(card().getByText('Sarah Lefèvre')).toBeVisible()
    // La carte change tout de suite ; le toast arrive quand le serveur a confirmé.
    await expect(page.getByText('Sarah Lefèvre placed on the Wall as Maman Parc')).toBeVisible()

    // Survit au rechargement, et l'historique garde la trace.
    await page.reload()
    await expect(card().getByText('Sarah Lefèvre')).toBeVisible()
    await card().getByRole('button', { name: 'Selection options for Maman Parc' }).click()
    await menu.getByRole('button', { name: 'Selection history' }).click()
    await expect(menu.getByText('Nadia Ferrand', { exact: true }).first()).toBeVisible()

    // Vider la carte : elle redevient une décision ouverte.
    await menu.getByRole('button', { name: 'Clear selection' }).click()
    await expect(page.getByText(/Maman Parc is open again/)).toBeVisible()
    await expect(page.getByRole('article', { name: 'Maman Parc, open role' })).toBeVisible()
    await expect(page.getByText('4 of 8', { exact: true })).toBeVisible()

    // Choisir depuis la Review Queue™ remet la démo en état : Nadia Ferrand.
    await placeFromQueue(page, 'Maman Parc', 'Nadia Ferrand')
    await expect(card().getByText('Nadia Ferrand')).toBeVisible()
    await expect(page.getByText('5 of 8', { exact: true })).toBeVisible()
  })

  test('mode présentation, puis export', async ({ page }) => {
    await openWall(page)
    await page.getByRole('button', { name: 'Present' }).click()
    await expect(page.getByRole('button', { name: /Exit/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /Exit/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export The Wall™' })
    await expect(dialog.getByRole('img', { name: 'Preview of the export' })).toBeVisible()
    await dialog.getByRole('button', { name: /Wallpaper/ }).click()
    await expect(dialog.getByText('2560 × 1440 px')).toBeVisible()
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download wallpaper' }).click()
    expect((await download).suggestedFilename()).toBe('clem-the-wall-2560x1440.png')
  })
})

test('la sélection retirée dans le test précédent est rétablie', async ({ page }) => {
  // Filet : si le test de remplacement a échoué en route, la démo est remise ici.
  await signInAs(page, 'peter@letitcast.demo', 'studio')
  await openWall(page)
  const open = page.getByRole('article', { name: 'Maman Parc, open role' })
  const card = page.locator('article[data-role-id]', { has: page.locator('h3', { hasText: /^Maman Parc$/ }) })
  if (await open.count()) await placeFromQueue(page, 'Maman Parc', 'Nadia Ferrand')
  if (!(await card.getByText('Nadia Ferrand').count())) {
    await card.locator('footer button').click()
    const menu = page.getByRole('dialog', { name: 'Maman Parc — selection' })
    await menu.getByRole('listitem').filter({ hasText: 'Nadia Ferrand' }).getByRole('button', { name: 'Place' }).click()
  }
  await expect(card.getByText('Nadia Ferrand')).toBeVisible()
})
