"use client";

import { useState, useMemo, Suspense } from "react";
import { useQuotes, useDeactivateQuote } from "@/hooks/useQuotes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { useOpportunities } from "@/hooks/useOpportunities";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Lock, Unlock } from "lucide-react";
import type { Quote } from "@/types/quote";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";

function QuotesPageContent() {
  const searchParams = useSearchParams();
  const [skip] = useState(0);
  const [limit] = useState(1000);
  const [searchQuery, setSearchQuery] = useState("");
  const opportunityIdFilter = searchParams.get("opportunity_id") || undefined;

  const { data, isLoading, error, refetch } = useQuotes({
    skip,
    limit,
    opportunity_id: opportunityIdFilter,
  });
  const deactivateQuote = useDeactivateQuote();

  // Initialize search query from URL parameter
  useState(() => {
    const searchParam = searchParams.get("search");
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  });

  const handleDeactivate = async (quoteId: string, quoteNumber: string) => {
    if (!confirm(`Are you sure you want to deactivate quote "${quoteNumber}"? This will unlock the opportunity and estimates.`)) {
      return;
    }
    
    try {
      await deactivateQuote.mutateAsync(quoteId);
      refetch();
    } catch (err) {
      console.error("Failed to deactivate quote:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Fetch opportunities to get opportunity names
  const { data: opportunitiesData } = useOpportunities({ limit: 1000 });

  // Group quotes by opportunity
  const groupedByOpportunity = useMemo(() => {
    if (!data?.items || !opportunitiesData?.items) return {};

    const grouped: Record<
      string,
      {
        opportunity: {
          id: string;
          name: string;
          account_name?: string;
        };
        quotes: Quote[];
      }
    > = {};

    const opportunitiesMap = new Map(
      opportunitiesData.items.map((o) => [o.id, o])
    );

    data.items.forEach((quote) => {
      const opportunityId = quote.opportunity_id;
      if (!grouped[opportunityId]) {
        const opportunity = opportunitiesMap.get(opportunityId);
        if (opportunity) {
          grouped[opportunityId] = {
            opportunity: {
              id: opportunity.id,
              name: opportunity.name,
              account_name: opportunity.account_name,
            },
            quotes: [],
          };
        }
      }
      if (grouped[opportunityId]) {
        grouped[opportunityId].quotes.push(quote);
      }
    });

    // Sort quotes within each opportunity by version (newest first)
    Object.values(grouped).forEach((group) => {
      group.quotes.sort((a, b) => b.version - a.version);
    });

    return grouped;
  }, [data?.items, opportunitiesData?.items]);

  // Filter grouped quotes by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedByOpportunity;
    }

    const query = searchQuery.toLowerCase();
    const filtered: typeof groupedByOpportunity = {};

    Object.entries(groupedByOpportunity).forEach(([opportunityId, group]) => {
      const matchingQuotes = group.quotes.filter((quote) => {
        const quoteNumber = (quote.quote_number || "").toLowerCase();
        const status = (quote.status || "").toLowerCase();
        const opportunityName = (group.opportunity.name || "").toLowerCase();
        return (
          quoteNumber.includes(query) ||
          status.includes(query) ||
          opportunityName.includes(query)
        );
      });

      if (matchingQuotes.length > 0) {
        filtered[opportunityId] = {
          ...group,
          quotes: matchingQuotes,
        };
      }
    });

    return filtered;
  }, [groupedByOpportunity, searchQuery]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading quotes...</p>
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
            <p className="text-red-500">Error loading quotes: {error.message}</p>
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
              <FileText className="h-5 w-5" />
              Quotes
            </CardTitle>
            <Link href="/quotes/create">
              <Button>Create Quote</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search quotes by number, status, or opportunity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </div>

          {Object.keys(filteredGroups).length === 0 ? (
            <p className="text-gray-500">No quotes found.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(filteredGroups).map(([opportunityId, group]) => (
                <div key={opportunityId} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Link
                        href={`/opportunities/${opportunityId}`}
                        className="text-lg font-semibold hover:underline"
                      >
                        {highlightText(group.opportunity.name, searchQuery)}
                      </Link>
                      {group.opportunity.account_name && (
                        <p className="text-sm text-gray-500">
                          {group.opportunity.account_name}
                        </p>
                      )}
                    </div>
                    <Link href={`/quotes/create?opportunity_id=${opportunityId}`}>
                      <Button size="sm">Create Quote</Button>
                    </Link>
                  </div>

                  <div className="space-y-2">
                    {group.quotes.map((quote) => (
                      <div
                        key={quote.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded border"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <Link
                            href={`/quotes/${quote.id}`}
                            className="font-medium hover:underline"
                          >
                            {highlightText(quote.quote_number, searchQuery)}
                          </Link>
                          <QuoteStatusBadge status={quote.status} />
                          {quote.is_active && (
                            <span className="flex items-center gap-1 text-green-600 text-sm">
                              <Lock className="h-4 w-4" />
                              Active
                            </span>
                          )}
                          <span className="text-sm text-gray-500">
                            Version {quote.version}
                          </span>
                          {quote.sent_date && (
                            <span className="text-sm text-gray-500">
                              Sent: {new Date(quote.sent_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Link href={`/quotes/${quote.id}`}>
                            <Button variant="outline" size="sm">
                              View
                            </Button>
                          </Link>
                          {quote.is_active && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeactivate(quote.id, quote.quote_number)}
                              disabled={deactivateQuote.isPending}
                            >
                              <Unlock className="h-4 w-4 mr-1" />
                              Unlock
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function QuotesPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading quotes...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <QuotesPageContent />
    </Suspense>
  );
}

