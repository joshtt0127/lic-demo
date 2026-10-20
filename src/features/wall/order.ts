import type { RoleTypeDb, WallRoleViewRow } from '@/types/database'

/**
 * The Wall™ — ordre et catégories, sans effet de bord (testé dans order.test.ts).
 *
 * L'ordre d'importance est celui que la production a écrit dans sa fiche rôle,
 * jamais une déduction : le type du rôle d'abord (premiers rôles, seconds
 * rôles, petits rôles), puis l'ordre des rôles dans leur casting. Le nombre
 * d'auditions ou le nom du rôle n'entrent jamais dans le calcul.
 */

export type WallRole = WallRoleViewRow

const TYPE_RANK: Record<RoleTypeDb, number> = { lead: 0, supporting: 1, small: 2, contestant: 3 }

export const CATEGORY_LABEL: Record<RoleTypeDb, string> = {
  lead: 'Lead Roles',
  supporting: 'Supporting Roles',
  small: 'Small Roles',
  contestant: 'Contestants',
}

const time = (value: string | null | undefined) => (value ? new Date(value).getTime() : 0)

export function byImportance(a: WallRole, b: WallRole): number {
  return (
    TYPE_RANK[a.role_type] - TYPE_RANK[b.role_type] ||
    time(a.casting_created_at) - time(b.casting_created_at) ||
    a.sort_order - b.sort_order ||
    time(a.created_at) - time(b.created_at) ||
    a.role_id.localeCompare(b.role_id)
  )
}

/**
 * L'ordre affiché : celui que l'équipe a arrangé s'il existe, sinon
 * l'importance. Un rôle créé après l'arrangement prend sa place d'importance
 * parmi les rôles non arrangés, à la suite des autres.
 */
export function orderRoles(roles: WallRole[], custom: string[] | null | undefined): WallRole[] {
  const ranked = [...roles].sort(byImportance)
  if (!custom || custom.length === 0) return ranked
  const position = new Map(custom.map((id, index) => [id, index]))
  const placed = ranked
    .filter((role) => position.has(role.role_id))
    .sort((a, b) => position.get(a.role_id)! - position.get(b.role_id)!)
  return [...placed, ...ranked.filter((role) => !position.has(role.role_id))]
}

/** `all`, un type de rôle, ou un groupe propre à la production. */
export type WallCategory = 'all' | RoleTypeDb | `group:${string}`

export type CategoryTab = { key: WallCategory; label: string; count: number }

/**
 * Les onglets reflètent les rôles réels du projet : un type sans rôle ne
 * s'affiche pas, les groupes de la production suivent les types.
 */
export function categoryTabs(roles: WallRole[]): CategoryTab[] {
  const tabs: CategoryTab[] = [{ key: 'all', label: 'All Roles', count: roles.length }]
  for (const type of Object.keys(TYPE_RANK) as RoleTypeDb[]) {
    const count = roles.filter((role) => role.role_type === type).length
    if (count > 0) tabs.push({ key: type, label: CATEGORY_LABEL[type], count })
  }
  const groups = new Map<string, number>()
  for (const role of [...roles].sort(byImportance)) {
    const group = role.role_group?.trim()
    if (group) groups.set(group, (groups.get(group) ?? 0) + 1)
  }
  for (const [group, count] of groups) tabs.push({ key: `group:${group}`, label: group, count })
  return tabs
}

export function inCategory(role: WallRole, category: WallCategory): boolean {
  if (category === 'all') return true
  if (category.startsWith('group:')) return role.role_group?.trim() === category.slice('group:'.length)
  return role.role_type === category
}

export function categoryLabel(category: WallCategory): string {
  if (category === 'all') return 'All Roles'
  if (category.startsWith('group:')) return category.slice('group:'.length)
  return CATEGORY_LABEL[category as RoleTypeDb]
}

/** « 5 of 8 roles selected » : une sélection sur le mur, pas un casting confirmé. */
export function castingProgress(roles: WallRole[]) {
  const selected = roles.filter((role) => role.application_id).length
  const confirmed = roles.filter((role) => role.application_status === 'cast').length
  return { selected, total: roles.length, confirmed }
}

/** Déplace un rôle d'un cran (clavier, boutons) dans un ordre complet. */
export function moveBy(order: string[], roleId: string, delta: number): string[] {
  const from = order.indexOf(roleId)
  if (from < 0) return order
  const to = Math.max(0, Math.min(order.length - 1, from + delta))
  return moveTo(order, roleId, to)
}

/** Déplace un rôle à une position donnée (glisser-déposer). */
export function moveTo(order: string[], roleId: string, to: number): string[] {
  const from = order.indexOf(roleId)
  if (from < 0 || from === to) return order
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, roleId)
  return next
}

/**
 * Déplacer une carte dans une vue filtrée la fait passer devant (ou derrière)
 * sa voisine visible, sans bousculer les rôles cachés.
 */
export function moveAmongVisible(
  order: string[],
  visible: string[],
  roleId: string,
  delta: number,
): string[] {
  const index = visible.indexOf(roleId)
  const neighbour = visible[index + delta]
  if (index < 0 || !neighbour) return order
  const target = order.indexOf(neighbour)
  return moveTo(order, roleId, target)
}

/** Vrai quand l'ordre affiché diffère de l'importance (le bouton Reset a un sens). */
export function isCustomOrder(roles: WallRole[], custom: string[] | null | undefined): boolean {
  if (!custom || custom.length === 0) return false
  const importance = [...roles].sort(byImportance).map((role) => role.role_id)
  const current = orderRoles(roles, custom).map((role) => role.role_id)
  return importance.some((id, index) => current[index] !== id)
}
