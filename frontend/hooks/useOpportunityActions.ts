/**
 * Shared action handlers for opportunities: Estimate, Quotes, Engagement, Delete.
 * Used by both the opportunities list page and the opportunity detail page.
 */

import { useRouter } from "next/navigation";
import { useEstimates } from "@/hooks/useEstimates";
import { useQuotes } from "@/hooks/useQuotes";
import { useDeleteOpportunity } from "@/hooks/useOpportunities";

export function useOpportunityActions() {
  const router = useRouter();
  const { data: allEstimatesData } = useEstimates({ limit: 1000 });
  const { data: allQuotesData } = useQuotes({ limit: 1000 });
  const deleteOpportunity = useDeleteOpportunity();

  const getActiveEstimateId = (opportunityId: string): string | null => {
    if (!allEstimatesData?.items) return null;
    const activeEstimate = allEstimatesData.items.find(
      (est) => est.opportunity_id === opportunityId && est.active_version === true
    );
    return activeEstimate?.id || null;
  };

  const hasQuotes = (opportunityId: string): boolean => {
    if (!allQuotesData?.items) return false;
    return allQuotesData.items.some((quote) => quote.opportunity_id === opportunityId);
  };

  const hasActiveQuote = (opportunityId: string): boolean => {
    if (!allQuotesData?.items || !opportunityId) return false;
    return allQuotesData.items.some(
      (quote) => quote.opportunity_id === opportunityId && quote.is_active === true
    );
  };

  const getActiveQuoteId = (opportunityId: string): string | null => {
    if (!allQuotesData?.items || !opportunityId) return null;
    const activeQuote = allQuotesData.items.find(
      (quote) => quote.opportunity_id === opportunityId && quote.is_active === true
    );
    return activeQuote?.id || null;
  };

  const handleEstimatesClick = (opportunityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const activeEstimateId = getActiveEstimateId(opportunityId);
    if (activeEstimateId) {
      router.push(`/estimates/${activeEstimateId}`);
    } else {
      router.push(`/estimates?opportunity_id=${opportunityId}`);
    }
  };

  const handleQuotesClick = (opportunityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const activeQuoteId = getActiveQuoteId(opportunityId);
    if (activeQuoteId) {
      router.push(`/quotes/${activeQuoteId}`);
    } else if (hasQuotes(opportunityId)) {
      router.push(`/quotes?opportunity_id=${opportunityId}`);
    } else {
      router.push(`/quotes/create?opportunity_id=${opportunityId}`);
    }
  };

  const handleDelete = async (
    id: string,
    opportunity: { is_permanently_locked?: boolean; is_locked?: boolean } | undefined,
    onSuccess?: () => void
  ) => {
    if (opportunity?.is_permanently_locked || opportunity?.is_locked) return;
    if (confirm("Are you sure you want to delete this opportunity?")) {
      try {
        await deleteOpportunity.mutateAsync(id);
        onSuccess?.();
      } catch (err) {
        console.error("Failed to delete opportunity:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  return {
    getActiveEstimateId,
    getActiveQuoteId,
    hasQuotes,
    hasActiveQuote,
    handleEstimatesClick,
    handleQuotesClick,
    handleDelete,
    deleteOpportunity,
  };
}
