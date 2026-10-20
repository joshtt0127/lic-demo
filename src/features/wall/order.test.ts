import { describe, expect, it } from 'vitest'
import type { WallRoleViewRow } from '@/types/database'
import {
  castingProgress,
  categoryTabs,
  inCategory,
  isCustomOrder,
  moveAmongVisible,
  moveBy,
  orderRoles,
} from './order'

let seq = 0
function role(name: string, patch: Partial<WallRoleViewRow> = {}): WallRoleViewRow {
  seq += 1
  return {
    role_id: name,
    project_id: 'p',
    casting_call_id: 'c',
    casting_title: 'Casting',
    casting_created_at: '2026-10-01T00:00:00Z',
    name,
    description: null,
    role_type: 'supporting',
    role_group: null,
    sort_order: seq,
    role_status: 'open',
    created_at: '2026-10-01T00:00:00Z',
    auditions: 0,
    interesting: 0,
    application_id: null,
    selected_by: null,
    selected_at: null,
    talent_id: null,
    application_status: null,
    actor_name: null,
    self_tape_id: null,
    duration_s: null,
    ...patch,
  }
}

const cast = [
  role('Mélusine', { role_type: 'small', sort_order: 1 }),
  role('Michel', { role_type: 'supporting', sort_order: 5, role_group: 'La famille Parc' }),
  role('Alizée', { role_type: 'lead', sort_order: 2 }),
  role('Clem', { role_type: 'lead', sort_order: 1, auditions: 2 }),
  role('Julien', { role_type: 'supporting', sort_order: 4, auditions: 99 }),
  role('Maman Parc', { role_type: 'small', sort_order: 0, role_group: 'La famille Parc' }),
]

describe('The Wall — ordre', () => {
  it("range par importance déclarée : type puis ordre de la fiche rôle, jamais le nombre d'auditions", () => {
    expect(orderRoles(cast, null).map((r) => r.name)).toEqual([
      'Clem',
      'Alizée',
      'Julien',
      'Michel',
      'Maman Parc',
      'Mélusine',
    ])
  })

  it("respecte l'arrangement de l'équipe et place les nouveaux rôles ensuite", () => {
    const custom = ['Mélusine', 'Clem']
    expect(orderRoles(cast, custom).map((r) => r.name)).toEqual([
      'Mélusine',
      'Clem',
      'Alizée',
      'Julien',
      'Michel',
      'Maman Parc',
    ])
    expect(isCustomOrder(cast, custom)).toBe(true)
    expect(isCustomOrder(cast, ['Clem', 'Alizée'])).toBe(false)
  })

  it('déplace une carte parmi les cartes visibles sans bousculer les autres', () => {
    const order = ['Clem', 'Alizée', 'Julien', 'Michel', 'Maman Parc', 'Mélusine']
    expect(moveBy(order, 'Julien', -1)).toEqual(['Clem', 'Julien', 'Alizée', 'Michel', 'Maman Parc', 'Mélusine'])
    expect(moveBy(order, 'Clem', -1)).toEqual(order)
    // Vue « Small Roles » : Mélusine passe devant Maman Parc.
    expect(moveAmongVisible(order, ['Maman Parc', 'Mélusine'], 'Mélusine', -1)).toEqual([
      'Clem',
      'Alizée',
      'Julien',
      'Michel',
      'Mélusine',
      'Maman Parc',
    ])
  })
})

describe('The Wall — catégories et progression', () => {
  it('ne montre que les catégories réellement utilisées, puis les groupes de la production', () => {
    const tabs = categoryTabs(cast)
    expect(tabs.map((tab) => `${tab.label} ${tab.count}`)).toEqual([
      'All Roles 6',
      'Lead Roles 2',
      'Supporting Roles 2',
      'Small Roles 2',
      'La famille Parc 2',
    ])
    expect(cast.filter((r) => inCategory(r, 'group:La famille Parc')).map((r) => r.name)).toEqual([
      'Michel',
      'Maman Parc',
    ])
  })

  it('compte les rôles sélectionnés sans les confondre avec un casting confirmé', () => {
    const roles = [
      role('A', { application_id: 'x', application_status: 'shortlisted' }),
      role('B', { application_id: 'y', application_status: 'cast' }),
      role('C'),
    ]
    expect(castingProgress(roles)).toEqual({ selected: 2, total: 3, confirmed: 1 })
  })
})
