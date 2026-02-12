"use client";

import { useState, Suspense } from "react";
import { useQuotesForApproval, useUpdateQuoteStatus } from "@/hooks/useQuotes";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useEngagements } from "@/hooks/useEngagements";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { CheckCircle2, XCircle, FileText, Search, Briefcase } from "lucide-react";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import type { Quote } from "@/types/quote";

function QuoteApprovalsPageContent() {
  const [skip] = useState(0);
  const [limit] = useState(1000);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, refetch } = useQuotesForApproval({
    skip,
    limit,
  });
  const updateQuoteStatus = useUpdateQuoteStatus();
  const { data: opportunitiesData } = useOpportunities({ limit: 1000 });
  const { data: engagementsData, refetch: refetchEngagements } = useEngagements({ limit: 1000 });
  const queryClient = useQueryClient();

  const handleApprove = async (quoteId: string, displayName: string) => {
    if (!confirm(`Are you sure you want to approve quote "${displayName}"? This will create an Engagement.`)) {
      return;
    }

    try {
      await updateQuoteStatus.mutateAsync({
        quoteId,
        status: { status: "ACCEPTED" },
      });
      // Invalidate engagements query to refetch and get the newly created engagement
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      // Wait a moment for the engagement to be created, then refetch
      await new Promise(resolve => setTimeout(resolve, 1500));
      refetch();
      await refetchEngagements();
      alert(`Quote "${displayName}" approved successfully! An Engagement has been created. Check the Engagements page to view it.`);
    } catch (err) {
      console.error("Failed to approve quote:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleReject = async (quoteId: string, displayName: string) => {
    if (!confirm(`Are you sure you want to reject quote "${displayName}"? This will unlock the opportunity.`)) {
      return;
    }

    try {
      await updateQuoteStatus.mutateAsync({
        quoteId,
        status: { status: "REJECTED" },
      });
      refetch();
    } catch (err) {
      console.error("Failed to reject quote:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Filter quotes by search query
  const filteredQuotes = data?.items.filter((quote) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const quoteNumber = (quote.quote_number || "").toLowerCase();
    const displayName = (quote.display_name || "").toLowerCase();
    const opportunityName =
      opportunitiesData?.items.find((o) => o.id === quote.opportunity_id)
        ?.name || "";
    const accountName =
      opportunitiesData?.items.find((o) => o.id === quote.opportunity_id)
        ?.account_name || "";

    return (
      quoteNumber.includes(query) ||
      displayName.includes(query) ||
      opportunityName.toLowerCase().includes(query) ||
      accountName.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading quotes for approval...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-500">
              Error loading quotes: {error.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Quote Approvals
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search quotes by number, opportunity, or account..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-md pl-10"
              />
            </div>
          </div>

          {!filteredQuotes || filteredQuotes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">
                {searchQuery.trim()
                  ? "No quotes match your search criteria."
                  : "No Draft quotes available for approval. You may not be configured as a Delivery Center approver, or there are no Draft quotes matching your delivery centers."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredQuotes.map((quote) => {
                const opportunity = opportunitiesData?.items.find(
                  (o) => o.id === quote.opportunity_id
                );
                const engagement = engagementsData?.items.find(
                  (e) => e.quote_id === quote.id
                );

                return (
                  <div
                    key={quote.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Link
                            href={`/quotes/${quote.id}`}
                            className="font-semibold text-lg hover:underline flex items-center gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            {quote.display_name}
                          </Link>
                          <QuoteStatusBadge status={quote.status} />
                          <span className="text-sm text-gray-500">
                            Version {quote.version}
                          </span>
                          {engagement && (
                            <Link
                              href={`/engagements/${engagement.id}`}
                              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Briefcase className="h-3 w-3" />
                              View Engagement
                            </Link>
                          )}
                        </div>

                        {opportunity && (
                          <div className="space-y-1 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Opportunity:</span>{" "}
                              <Link
                                href={`/opportunities/${opportunity.id}`}
                                className="hover:underline"
                              >
                                {opportunity.name}
                              </Link>
                            </div>
                            {opportunity.account_name && (
                              <div>
                                <span className="font-medium">Account:</span>{" "}
                                {opportunity.account_name}
                              </div>
                            )}
                            {quote.created_by_name && (
                              <div>
                                <span className="font-medium">Created by:</span>{" "}
                                {quote.created_by_name}
                              </div>
                            )}
                            {quote.created_at && (
                              <div>
                                <span className="font-medium">Created:</span>{" "}
                                {new Date(quote.created_at).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        )}

                        {quote.notes && (
                          <div className="mt-2 text-sm text-gray-600">
                            <span className="font-medium">Notes:</span>{" "}
                            {quote.notes}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <Link href={`/quotes/${quote.id}`}>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </Link>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleApprove(quote.id, quote.display_name)}
                          disabled={updateQuoteStatus.isPending}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleReject(quote.id, quote.display_name)}
                          disabled={updateQuoteStatus.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function QuoteApprovalsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6">
          <Card>
            <CardContent className="p-6">
              <p>Loading quotes for approval...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <QuoteApprovalsPageContent />
    </Suspense>
  );
}
