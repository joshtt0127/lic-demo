import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getWallProject,
  listSelectionHistory,
  listWallCandidates,
  listWallRoles,
  setWallOrder,
  setWallSelection,
  signSelfTapes,
  subscribeToWall,
  type WallProject,
} from '@/data/repositories/wall'
import type { WallRoleViewRow } from '@/types/database'

/**
 * The Wall™ — données serveur.
 *
 * Le mur est partagé : chaque changement d'une personne de l'équipe arrive
 * chez les autres par le temps réel (journal des sélections), et les
 * compteurs d'auditions se relisent toutes les 30 secondes et au retour sur
 * l'onglet — pas de « recharger la page » pour voir le casting avancer.
 */

export const wallKeys = {
  project: (projectId: string | undefined) => ['wall-project', projectId] as const,
  roles: (projectId: string | undefined) => ['wall-roles', projectId] as const,
  candidates: (roleId: string | undefined) => ['wall-candidates', roleId] as const,
  history: (roleId: string | undefined) => ['wall-history', roleId] as const,
}

export function useWallProject(projectId: string | undefined) {
  return useQuery({
    queryKey: wallKeys.project(projectId),
    queryFn: () => getWallProject(projectId as string),
    enabled: Boolean(projectId),
  })
}

export function useWallRoles(projectId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!projectId) return
    return subscribeToWall(projectId, () => {
      void queryClient.invalidateQueries({ queryKey: wallKeys.roles(projectId) })
      void queryClient.invalidateQueries({ queryKey: ['wall-history'] })
    })
  }, [projectId, queryClient])

  return useQuery({
    queryKey: wallKeys.roles(projectId),
    queryFn: () => listWallRoles(projectId as string),
    enabled: Boolean(projectId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useWallCandidates(roleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: wallKeys.candidates(roleId),
    queryFn: () => listWallCandidates(roleId as string),
    enabled: Boolean(roleId) && enabled,
  })
}

export function useSelectionHistory(roleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: wallKeys.history(roleId),
    queryFn: () => listSelectionHistory(roleId as string),
    enabled: Boolean(roleId) && enabled,
  })
}

/** L'URL signée de la vidéo d'une audition, pour l'aperçu sur le mur. */
export function useTapeVideo(selfTapeId: string | null | undefined) {
  return useQuery({
    queryKey: ['wall-tape-video', selfTapeId],
    queryFn: async () => (await signSelfTapes([selfTapeId as string]))[selfTapeId as string] ?? null,
    enabled: Boolean(selfTapeId),
    staleTime: 20 * 60_000,
  })
}

export function useWallMutations(projectId: string | undefined) {
  const queryClient = useQueryClient()

  const select = useMutation({
    mutationFn: ({
      roleId,
      applicationId,
    }: {
      roleId: string
      applicationId: string | null
      /** Ce que la carte affiche avant la confirmation du serveur. */
      actorName?: string | null
      selfTapeId?: string | null
    }) =>
      setWallSelection(roleId, applicationId),
    // Le mur change tout de suite ; le serveur confirme (ou on revient en arrière).
    onMutate: async ({ roleId, applicationId, actorName, selfTapeId }) => {
      const key = wallKeys.roles(projectId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<WallRoleViewRow[]>(key)
      queryClient.setQueryData<WallRoleViewRow[]>(key, (roles) =>
        roles?.map((role) =>
          role.role_id === roleId
            ? {
                ...role,
                application_id: applicationId,
                actor_name: applicationId ? (actorName ?? role.actor_name) : null,
                // Jamais l'image de l'ancien comédien sous le nom du nouveau.
                self_tape_id: applicationId ? (selfTapeId ?? null) : null,
                application_status: null,
                selected_at: applicationId ? new Date().toISOString() : null,
              }
            : role,
        ),
      )
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(wallKeys.roles(projectId), context.previous)
    },
    onSettled: (_data, _error, { roleId }) => {
      void queryClient.invalidateQueries({ queryKey: wallKeys.roles(projectId) })
      void queryClient.invalidateQueries({ queryKey: wallKeys.history(roleId) })
    },
  })

  const arrange = useMutation({
    mutationFn: (order: string[] | null) => setWallOrder(projectId as string, order),
    onMutate: async (order) => {
      const key = wallKeys.project(projectId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<WallProject | null>(key)
      queryClient.setQueryData<WallProject | null>(key, (project) =>
        project ? { ...project, wall_order: order && order.length > 0 ? order : null } : project,
      )
      return { previous }
    },
    onError: (_error, _order, context) => {
      if (context) queryClient.setQueryData(wallKeys.project(projectId), context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: wallKeys.project(projectId) })
    },
  })

  return { select, arrange }
}
