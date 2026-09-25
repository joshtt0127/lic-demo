import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { IntelligenceFeedRow } from "@/types/database";

/**
 * Le feed d'attention d'un casting.
 *
 * Tout le calcul est en base, volontairement. Refaire le tri côté navigateur
 * voudrait dire descendre toutes les candidatures pour les reclasser, et
 * surtout laisser la règle diverger entre le SQL et le TypeScript. Ici il n'y a
 * qu'une seule définition de « ce qui demande ton attention », et l'interface
 * ne fait que l'afficher.
 */
export function useIntelligenceFeed(castingId: string | undefined) {
  return useQuery({
    queryKey: ["intelligence-feed", castingId],
    queryFn: async (): Promise<IntelligenceFeedRow[]> => {
      const { data, error } = await supabase.rpc("intelligence_feed", {
        p_casting: castingId as string,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(castingId),
    // Les bandes bougent avec le temps qui passe (deadline, attente) autant
    // qu'avec les décisions : une minute de fraîcheur suffit, et évite de
    // relancer la requête à chaque retour d'onglet.
    staleTime: 60_000,
  });
}

export type EngagementKind =
  | "AUDITION_OPENED"
  | "AUDITION_VIEWED"
  | "AUDITION_COMPLETED"
  | "AUDITION_REWATCHED";

/**
 * Enregistre un geste de revue.
 *
 * **Ne remonte jamais d'erreur à l'écran.** Si la mesure d'attention échoue,
 * c'est la mesure qui est perdue, pas la session de travail de l'équipe : une
 * alerte rouge parce qu'un compteur n'a pas pu s'incrémenter serait pire que
 * l'oubli. L'échec est silencieux côté utilisateur et visible en console.
 */
export function useRecordEngagement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      applicationId: string;
      kind: EngagementKind;
      progress?: number;
    }) => {
      const { error } = await supabase.rpc("record_review_engagement", {
        p_application: input.applicationId,
        p_kind: input.kind,
        p_progress: input.progress ?? null,
      });
      if (error) throw error;
    },
    onError: (error) => {
      console.warn("Engagement not recorded", error);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["intelligence-feed"] });
    },
  });
}

/** Consulter un profil depuis l'espace production. Silencieux lui aussi. */
export async function recordProfileView(talentId: string): Promise<void> {
  const { error } = await supabase.rpc("record_profile_view", {
    p_talent: talentId,
  });
  if (error) console.warn("Profile view not recorded", error);
}
