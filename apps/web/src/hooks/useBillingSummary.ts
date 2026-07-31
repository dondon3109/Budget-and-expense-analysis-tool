import { useQuery } from "@tanstack/react-query";

import { getBillingSummary } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function useBillingSummary(workspace: AuthenticatedWorkspace) {
  return useQuery({
    queryKey: queryKeys.billing(workspace),
    queryFn: () => getBillingSummary(workspace),
  });
}
