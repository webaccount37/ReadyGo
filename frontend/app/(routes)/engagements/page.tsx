"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useEngagements } from "@/hooks/useEngagements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { FileText, ExternalLink, FolderOpen } from "lucide-react";
import { lucideManilaFolderOpen } from "@/lib/manilaFolder";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SortableTh, type SortState } from "@/components/ui/sortable-th";

function EngagementsPageContent() {
  const router = useRouter();
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ column: "name", direction: "asc" });
  const debouncedSearch = useDebouncedValue(searchQuery, 350);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, sort.column, sort.direction]);

  const handleSort = (column: string) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    );
  };

  const { data, isLoading, error } = useEngagements({
    skip,
    limit,
    search: debouncedSearch.trim() || undefined,
    sort_by: sort.column || undefined,
    sort_order: sort.direction,
  });

  const formatDate = (dateStr: string): string => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    });
  };

  const formatCurrency = (amount: string | number | undefined, currency: string = "USD") => {
    if (amount == null || amount === "" || amount === undefined) return "—";
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(num)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(num);
  };

  const formatPercentage = (value: string | number | undefined) => {
    if (value == null || value === "" || value === undefined) return "—";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "—";
    return `${num >= 0 ? "+" : ""}${num.toFixed(1)}%`;
  };

  const REVENUE_DEVIATION_THRESHOLD = 5;
  const getDeviationColor = (deviation: number) => {
    if (Math.abs(deviation) <= REVENUE_DEVIATION_THRESHOLD) return "text-green-600";
    if (Math.abs(deviation) <= REVENUE_DEVIATION_THRESHOLD * 2) return "text-yellow-600";
    return "text-red-600";
  };

  const rows = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-gray-600">Loading engagements...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">
              Error loading engagements: {error instanceof Error ? error.message : String(error)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Engagements</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage your engagements and resource plans
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="px-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Engagements ({data?.total ?? 0})</CardTitle>
            <div className="w-full sm:w-64">
              <Input
                type="text"
                placeholder="Search engagements..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2">
          {rows.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block w-full overflow-hidden">
                <table className="w-full text-xs table-fixed border-collapse">
                  <colgroup>
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "13%" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b">
                      <SortableTh label="Name" column="name" sort={sort} onSort={handleSort} title="Engagement" />
                      <SortableTh label="Account" column="account" sort={sort} onSort={handleSort} title="Account" />
                      <SortableTh label="Opportunity" column="opportunity" sort={sort} onSort={handleSort} title="Opportunity" />
                      <SortableTh label="Start" column="opportunity_start_date" sort={sort} onSort={handleSort} title="Opportunity start date" />
                      <SortableTh label="End" column="opportunity_end_date" sort={sort} onSort={handleSort} title="Opportunity end date" />
                      <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Resource Plan Revenue (USD)">Plan $</th>
                      <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Actuals from Approved Timesheets (USD)">Actuals $</th>
                      <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Quote/Estimate vs Resource Plan Revenue Deviation %">% Quote Dev</th>
                      <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Resource Plan vs Actuals Revenue Deviation %">% Plan Dev</th>
                      <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((engagement) => (
                      <tr
                        key={engagement.id}
                        className="border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/engagements/${engagement.id}`)}
                      >
                        <td className="p-1.5 overflow-hidden min-w-0" title={engagement.name || `Engagement - ${engagement.opportunity_name || engagement.opportunity_id}`}>
                          <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                        </td>
                        <td className="p-1.5 truncate text-xs overflow-hidden" title={engagement.account_name || "—"}>
                          {engagement.account_name ? (
                            <Link
                              href={`/accounts?search=${encodeURIComponent(engagement.account_name)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {engagement.account_name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-1.5 truncate text-xs overflow-hidden" title={engagement.opportunity_name || "—"}>
                          {engagement.opportunity_name ? (
                            <Link
                              href={`/opportunities?search=${encodeURIComponent(engagement.opportunity_name)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {engagement.opportunity_name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0"
                          title={engagement.opportunity_start_date ? new Date(engagement.opportunity_start_date + "T12:00:00").toLocaleDateString() : "—"}
                        >
                          {engagement.opportunity_start_date ? formatDate(engagement.opportunity_start_date) : "—"}
                        </td>
                        <td
                          className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0"
                          title={engagement.opportunity_end_date ? new Date(engagement.opportunity_end_date + "T12:00:00").toLocaleDateString() : "—"}
                        >
                          {engagement.opportunity_end_date ? formatDate(engagement.opportunity_end_date) : "—"}
                        </td>
                        <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden text-ellipsis min-w-0" title={engagement.plan_amount != null ? formatCurrency(engagement.plan_amount, "USD") : "—"}>
                          {engagement.plan_amount != null && engagement.plan_amount !== undefined && String(engagement.plan_amount) !== "0"
                            ? formatCurrency(engagement.plan_amount, "USD")
                            : "—"}
                        </td>
                        <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden text-ellipsis min-w-0" title={engagement.actuals_amount != null ? formatCurrency(engagement.actuals_amount, "USD") : "—"}>
                          {engagement.actuals_amount != null && engagement.actuals_amount !== undefined && String(engagement.actuals_amount) !== "0"
                            ? formatCurrency(engagement.actuals_amount, "USD")
                            : "—"}
                        </td>
                        <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={engagement.revenue_deviation_percentage != null ? `Quote vs Plan: ${formatPercentage(engagement.revenue_deviation_percentage)}` : "—"}>
                          {engagement.revenue_deviation_percentage != null && engagement.revenue_deviation_percentage !== undefined ? (
                            <span className={getDeviationColor(typeof engagement.revenue_deviation_percentage === "string" ? parseFloat(engagement.revenue_deviation_percentage) : engagement.revenue_deviation_percentage)}>
                              {formatPercentage(engagement.revenue_deviation_percentage)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={engagement.plan_vs_actuals_revenue_deviation_percentage != null ? `Plan vs Actuals: ${formatPercentage(engagement.plan_vs_actuals_revenue_deviation_percentage)}` : "—"}>
                          {engagement.plan_vs_actuals_revenue_deviation_percentage != null && engagement.plan_vs_actuals_revenue_deviation_percentage !== undefined ? (
                            <span className={getDeviationColor(typeof engagement.plan_vs_actuals_revenue_deviation_percentage === "string" ? parseFloat(engagement.plan_vs_actuals_revenue_deviation_percentage) : engagement.plan_vs_actuals_revenue_deviation_percentage)}>
                              {formatPercentage(engagement.plan_vs_actuals_revenue_deviation_percentage)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-1 overflow-hidden min-w-0">
                          <div className="flex flex-nowrap gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <Link href={`/opportunities/${engagement.opportunity_id}?tab=documents`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-5 w-5 p-0 shrink-0"
                                title="Opportunity documents (SharePoint)"
                              >
                                <FolderOpen className="w-3 h-3" {...lucideManilaFolderOpen} />
                              </Button>
                            </Link>
                            <Link
                              href={`/engagements/${engagement.id}`}
                            >
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-5 w-5 p-0 shrink-0"
                                title="View Details"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-4">
                {rows.map((engagement) => (
                  <Card
                    key={engagement.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/engagements/${engagement.id}`)}
                  >
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Name</div>
                          <div title={engagement.name || `Engagement - ${engagement.opportunity_name || engagement.opportunity_id}`}>
                            <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                          </div>
                        </div>
                        {engagement.account_name && (
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Account</div>
                            <Link
                              href={`/accounts?search=${encodeURIComponent(engagement.account_name)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {engagement.account_name}
                            </Link>
                          </div>
                        )}
                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Opportunity</div>
                          {engagement.opportunity_name ? (
                            <Link
                              href={`/opportunities?search=${encodeURIComponent(engagement.opportunity_name)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {engagement.opportunity_name}
                            </Link>
                          ) : (
                            <span className="text-sm">—</span>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Opp. start</div>
                          <span className="text-sm">
                            {engagement.opportunity_start_date ? formatDate(engagement.opportunity_start_date) : "—"}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Opp. end</div>
                          <span className="text-sm">
                            {engagement.opportunity_end_date ? formatDate(engagement.opportunity_end_date) : "—"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Plan $</div>
                            <span className="text-sm">
                              {engagement.plan_amount != null && String(engagement.plan_amount) !== "0"
                                ? formatCurrency(engagement.plan_amount, "USD")
                                : "—"}
                            </span>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Actuals $</div>
                            <span className="text-sm">
                              {engagement.actuals_amount != null && String(engagement.actuals_amount) !== "0"
                                ? formatCurrency(engagement.actuals_amount, "USD")
                                : "—"}
                            </span>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">% Quote Dev</div>
                            <span className="text-sm">
                              {engagement.revenue_deviation_percentage != null && engagement.revenue_deviation_percentage !== undefined ? (
                                <span className={getDeviationColor(typeof engagement.revenue_deviation_percentage === "string" ? parseFloat(engagement.revenue_deviation_percentage) : engagement.revenue_deviation_percentage)}>
                                  {formatPercentage(engagement.revenue_deviation_percentage)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </span>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">% Plan Dev</div>
                            <span className="text-sm">
                              {engagement.plan_vs_actuals_revenue_deviation_percentage != null && engagement.plan_vs_actuals_revenue_deviation_percentage !== undefined ? (
                                <span className={getDeviationColor(typeof engagement.plan_vs_actuals_revenue_deviation_percentage === "string" ? parseFloat(engagement.plan_vs_actuals_revenue_deviation_percentage) : engagement.plan_vs_actuals_revenue_deviation_percentage)}>
                                  {formatPercentage(engagement.plan_vs_actuals_revenue_deviation_percentage)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="pt-2 flex flex-col gap-2">
                          <Link
                            href={`/opportunities/${engagement.opportunity_id}?tab=documents`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button variant="outline" size="sm" className="w-full justify-center gap-2">
                              <FolderOpen className="w-4 h-4 shrink-0" {...lucideManilaFolderOpen} />
                              Opportunity documents
                            </Button>
                          </Link>
                          <Link
                            href={`/engagements/${engagement.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button variant="outline" size="sm" className="w-full">
                              View Details
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>
                {debouncedSearch.trim()
                  ? `No engagements found matching "${debouncedSearch}"`
                  : "No engagements found."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.total > limit && (
        <div className="flex justify-center items-center gap-4 mt-4">
          <Button
            variant="outline"
            onClick={() => setSkip(Math.max(0, skip - limit))}
            disabled={skip === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-600">
            Page {Math.floor(skip / limit) + 1} of {Math.ceil(data.total / limit)}
          </span>
          <Button
            variant="outline"
            onClick={() => setSkip(skip + limit)}
            disabled={skip + limit >= data.total}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default function EngagementsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <EngagementsPageContent />
    </Suspense>
  );
}
