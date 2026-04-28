"use client";

import { useState, useMemo, Suspense } from "react";
import { useQuotes, useDeactivateQuote } from "@/hooks/useQuotes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Lock, Unlock, ChevronDown, ChevronUp } from "lucide-react";
import type { Quote, QuoteListFinancialSummary, QuoteListOpportunitySnippet } from "@/types/quote";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";

function numFromSummary(v: string | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function QuotesPageContent() {
  const searchParams = useSearchParams();
  const [skip] = useState(0);
  const [limit] = useState(1000);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOpportunities, setExpandedOpportunities] = useState<Set<string>>(new Set());
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

  const handleDeactivate = async (quoteId: string, displayName: string) => {
    if (!confirm(`Are you sure you want to deactivate quote "${displayName}"? This will unlock the opportunity and estimates.`)) {
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

  const opportunitiesMap = useMemo(() => {
    const rows = data?.opportunities;
    if (!rows?.length) return new Map<string, QuoteListOpportunitySnippet>();
    return new Map(rows.map((o) => [o.id, o]));
  }, [data?.opportunities]);

  // Helper function to format currency
  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  // Helper function to format date without timezone conversion
  const formatLocalDate = (dateStr: string): string => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  };

  const summaryForDisplay = (fin: QuoteListFinancialSummary) => ({
    totalRevenue: numFromSummary(fin.total_revenue),
    marginAmount: numFromSummary(fin.margin_amount),
    marginPercentage: numFromSummary(fin.margin_percentage),
    quoteAmount: numFromSummary(fin.quote_amount),
    currency: fin.currency || "USD",
  });

  // Group quotes by opportunity
  const groupedByOpportunity = useMemo(() => {
    if (!data?.items?.length) return {};

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

    data.items.forEach((quote) => {
      const opportunityId = quote.opportunity_id;
      if (!grouped[opportunityId]) {
        const opportunity = opportunitiesMap.get(opportunityId);
        grouped[opportunityId] = {
          opportunity: {
            id: opportunityId,
            name: (opportunity?.name ?? quote.opportunity_name) || "Opportunity",
            account_name: (opportunity?.account_name ?? quote.account_name) ?? undefined,
          },
          quotes: [],
        };
      }
      grouped[opportunityId].quotes.push(quote);
    });

    Object.values(grouped).forEach((group) => {
      group.quotes.sort((a, b) => b.version - a.version);
    });

    return grouped;
  }, [data?.items, opportunitiesMap]);

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
        const displayName = (quote.display_name || "").toLowerCase();
        const status = (quote.status || "").toLowerCase();
        const opportunityName = (group.opportunity.name || "").toLowerCase();
        return (
          quoteNumber.includes(query) ||
          displayName.includes(query) ||
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
              {Object.entries(filteredGroups).map(([opportunityId, group]) => {
                const activeQuote = group.quotes.find((q) => q.is_active);
                const fin = activeQuote?.list_financial_summary;
                const estimateSummary = fin ? summaryForDisplay(fin) : null;
                const opportunity = opportunitiesMap.get(opportunityId);
                const permanentlyLocked = opportunity?.is_permanently_locked ?? false;

                return (
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

                    {activeQuote && estimateSummary && fin && (
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Lock className="h-4 w-4 text-green-600" />
                          <span className="font-semibold text-sm text-blue-900">Active Quote Summary</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600 text-xs">Quote Type</p>
                            <p className="font-medium text-blue-900">
                              {activeQuote.quote_type === "FIXED_BID" ? "Fixed Bid" : "Time & Materials"}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600 text-xs">Quote Amount</p>
                            <p className="font-medium text-green-700">
                              {formatCurrency(estimateSummary.quoteAmount, estimateSummary.currency)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600 text-xs">Estimate Revenue</p>
                            <p className="font-medium">
                              {formatCurrency(estimateSummary.totalRevenue, estimateSummary.currency)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600 text-xs">Margin Amount</p>
                            <p className="font-medium text-purple-700">
                              {formatCurrency(estimateSummary.marginAmount, estimateSummary.currency)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600 text-xs">Margin %</p>
                            <p className="font-medium text-orange-700">
                              {estimateSummary.marginPercentage.toFixed(2)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      {(() => {
                        const activeQuotes = group.quotes.filter((q) => q.is_active);
                        const inactiveQuotes = group.quotes.filter((q) => !q.is_active);
                        const isExpanded = expandedOpportunities.has(opportunityId);

                        return (
                          <>
                            {activeQuotes.map((quote) => (
                              <div
                                key={quote.id}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded border border-green-200"
                              >
                                <div className="flex items-center gap-4 flex-1">
                                  <Link
                                    href={`/quotes/${quote.id}`}
                                    className="font-medium hover:underline"
                                  >
                                    {highlightText(quote.display_name, searchQuery)}
                                  </Link>
                                  <QuoteStatusBadge status={quote.status} />
                                  <span className="flex items-center gap-1 text-green-600 text-sm">
                                    <Lock className="h-4 w-4" />
                                    Active
                                  </span>
                                  {permanentlyLocked && (
                                    <span
                                      className="inline-flex items-center justify-center w-5 h-5 rounded shrink-0 bg-violet-100 text-violet-700 border border-violet-200"
                                      title="Permanently Locked by Active Timesheets"
                                    >
                                      <Lock className="h-3 w-3 shrink-0" />
                                    </span>
                                  )}
                                  <span className="text-sm text-gray-500">
                                    Version {quote.version}
                                  </span>
                                  {quote.sent_date && (
                                    <span className="text-sm text-gray-500">
                                      Sent: {formatLocalDate(quote.sent_date)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Link href={`/quotes/${quote.id}`}>
                                    <Button variant="outline" size="sm">
                                      View
                                    </Button>
                                  </Link>
                                  {!permanentlyLocked && (
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => handleDeactivate(quote.id, quote.display_name)}
                                      disabled={deactivateQuote.isPending}
                                    >
                                      <Unlock className="h-4 w-4 mr-1" />
                                      Unlock
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}

                            {inactiveQuotes.length > 0 && (
                              <div className="border rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedOpportunities((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(opportunityId)) {
                                        next.delete(opportunityId);
                                      } else {
                                        next.add(opportunityId);
                                      }
                                      return next;
                                    });
                                  }}
                                  className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-t-lg transition-colors"
                                >
                                  <span className="text-sm font-medium text-gray-700">
                                    {inactiveQuotes.length} older version{inactiveQuotes.length !== 1 ? "s" : ""}
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4 text-gray-500" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-gray-500" />
                                  )}
                                </button>

                                {isExpanded && (
                                  <div className="border-t divide-y">
                                    {inactiveQuotes.map((quote) => {
                                      const isInvalid = quote.status === "INVALID";
                                      return (
                                        <div
                                          key={quote.id}
                                          className={`flex items-center justify-between px-3 py-1.5 ${
                                            isInvalid ? "bg-gray-50 opacity-75" : "bg-white"
                                          }`}
                                        >
                                          <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <Link
                                              href={`/quotes/${quote.id}`}
                                              className="text-xs font-medium hover:underline truncate"
                                            >
                                              {highlightText(quote.display_name, searchQuery)}
                                            </Link>
                                            <QuoteStatusBadge status={quote.status} />
                                            <span className="text-xs text-gray-500 whitespace-nowrap">
                                              v{quote.version}
                                            </span>
                                            {quote.sent_date && (
                                              <span className="text-xs text-gray-400 whitespace-nowrap">
                                                {formatLocalDate(quote.sent_date)}
                                              </span>
                                            )}
                                          </div>
                                          <Link href={`/quotes/${quote.id}`}>
                                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                              View
                                            </Button>
                                          </Link>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
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

export default function QuotesPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6">
          <Card>
            <CardContent className="p-6">
              <p>Loading quotes...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <QuotesPageContent />
    </Suspense>
  );
}
