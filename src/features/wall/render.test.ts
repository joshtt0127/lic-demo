import { describe, expect, it } from 'vitest'
import { cardHeightFactor, paginate, planGrid } from './render'

describe('The Wall — mise en page des exports', () => {
  it('remplit un fond d’écran Full HD avec les plus grandes cartes possibles', () => {
    const plan = planGrid(8, { width: 1747, height: 800 }, { includeStats: false, minNamePx: 13 })
    expect(plan.rows * plan.cardHeight + (plan.rows - 1) * plan.gap).toBeLessThanOrEqual(800.5)
    expect(plan.columns * plan.cardWidth + (plan.columns - 1) * plan.gap).toBeLessThanOrEqual(1747.5)
    // Huit rôles tiennent sur une ou deux lignes, jamais en colonne étroite.
    expect(plan.columns).toBeGreaterThanOrEqual(4)
    expect(plan.legible).toBe(true)
  })

  it('signale quand un trop grand casting ne reste pas lisible sur une seule image', () => {
    const plan = planGrid(60, { width: 1747, height: 800 }, { includeStats: true, minNamePx: 13 })
    expect(plan.legible).toBe(false)
  })

  it('sans hauteur imposée, compose une grille équilibrée', () => {
    expect(planGrid(3, { width: 3000, height: null }, { includeStats: true, minNamePx: 20 }).columns).toBe(3)
    expect(planGrid(8, { width: 3000, height: null }, { includeStats: true, minNamePx: 20 }).columns).toBe(4)
    expect(planGrid(30, { width: 3000, height: null }, { includeStats: true, minNamePx: 20 }).columns).toBe(6)
  })

  it('les statistiques agrandissent la carte, jamais l’image', () => {
    expect(cardHeightFactor(true)).toBeGreaterThan(cardHeightFactor(false))
  })

  it('découpe un grand casting en pages imprimables lisibles', () => {
    const cards = Array.from({ length: 30 }, (_, index) => index)
    const pages = paginate(cards, { width: 3200, height: 1700 }, { includeStats: true, minNamePx: 40 })
    expect(pages.flat()).toEqual(cards)
    expect(pages.length).toBeGreaterThan(1)
    for (const page of pages) {
      expect(planGrid(page.length, { width: 3200, height: 1700 }, { includeStats: true, minNamePx: 40 }).legible).toBe(true)
    }
  })
})
