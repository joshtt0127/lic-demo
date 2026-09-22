import { useQuery } from '@tanstack/react-query'
import { orgAnalytics } from '@/data/repositories/analytics'

/** Reports for the whole organization — counted, never estimated. */
export function useOrgAnalytics(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-analytics', orgId],
    queryFn: () => orgAnalytics(orgId as string),
    enabled: Boolean(orgId),
    staleTime: 60_000,
  })
}
