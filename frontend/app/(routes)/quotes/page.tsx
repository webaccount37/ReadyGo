"use client";

import { useState, useMemo, Suspense } from "react";
import { useQuotes, useDeactivateQuote } from "@/hooks/useQuotes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { useEngagements } from "@/hooks/useEngagements";
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
  const engagementIdFilter = searchParams.get("engagement_id") || undefined;

  const { data, isLoading, error, refetch } = useQuotes({
    skip,
    limit,
    engagement_id: engagementIdFilter,
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
    if (!confirm(`Are you sure you want to deactivate quote "${quoteNumber}"? This will unlock the engagement and estimates.`)) {
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

  // Fetch engagements to get engagement names
  const { data: engagementsData } = useEngagements({ limit: 1000 });

  // Group quotes by engagement
  const groupedByEngagement = useMemo(() => {
    if (!data?.items || !engagementsData?.items) return {};

    const grouped: Record<
      string,
      {
        engagement: {
          id: string;
          name: string;
          opportunity_name?: string;
        };
        quotes: Quote[];
      }
    > = {};

    const engagementsMap = new Map(
      engagementsData.items.map((e) => [e.id, e])
    );

    data.items.forEach((quote) => {
      const engagementId = quote.engagement_id;
      if (!grouped[engagementId]) {
        const engagement = engagementsMap.get(engagementId);
        if (engagement) {
          grouped[engagementId] = {
            engagement: {
              id: engagement.id,
              name: engagement.name,
              opportunity_name: engagement.opportunity_name,
            },
            quotes: [],
          };
        }
      }
      if (grouped[engagementId]) {
        grouped[engagementId].quotes.push(quote);
      }
    });

    // Sort quotes within each engagement by version (newest first)
    Object.values(grouped).forEach((group) => {
      group.quotes.sort((a, b) => b.version - a.version);
    });

    return grouped;
  }, [data?.items, engagementsData?.items]);

  // Filter grouped quotes by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedByEngagement;
    }

    const query = searchQuery.toLowerCase();
    const filtered: typeof groupedByEngagement = {};

    Object.entries(groupedByEngagement).forEach(([engagementId, group]) => {
      const matchingQuotes = group.quotes.filter((quote) => {
        const quoteNumber = (quote.quote_number || "").toLowerCase();
        const status = (quote.status || "").toLowerCase();
        const engagementName = (group.engagement.name || "").toLowerCase();
        return (
          quoteNumber.includes(query) ||
          status.includes(query) ||
          engagementName.includes(query)
        );
      });

      if (matchingQuotes.length > 0) {
        filtered[engagementId] = {
          ...group,
          quotes: matchingQuotes,
        };
      }
    });

    return filtered;
  }, [groupedByEngagement, searchQuery]);

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
              placeholder="Search quotes by number, status, or engagement..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </div>

          {Object.keys(filteredGroups).length === 0 ? (
            <p className="text-gray-500">No quotes found.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(filteredGroups).map(([engagementId, group]) => (
                <div key={engagementId} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Link
                        href={`/engagements/${engagementId}`}
                        className="text-lg font-semibold hover:underline"
                      >
                        {highlightText(group.engagement.name, searchQuery)}
                      </Link>
                      {group.engagement.opportunity_name && (
                        <p className="text-sm text-gray-500">
                          {group.engagement.opportunity_name}
                        </p>
                      )}
                    </div>
                    <Link href={`/quotes/create?engagement_id=${engagementId}`}>
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

