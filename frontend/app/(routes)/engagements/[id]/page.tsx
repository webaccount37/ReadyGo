"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useEngagementDetail, useApprovedHoursByWeek } from "@/hooks/useEngagements";
import { useOpportunity } from "@/hooks/useOpportunities";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useBillingTerms } from "@/hooks/useBillingTerms";
import { ResourcePlan } from "@/components/engagements/resource-plan";
import { PhaseManagement } from "@/components/engagements/phase-management";
import { ComparativeSummary } from "@/components/engagements/comparative-summary";
import { EngagementTimesheetApprovers } from "@/components/engagements/engagement-timesheet-approvers";
import { EngagementExpenseApprovers } from "@/components/engagements/engagement-expense-approvers";
import { EngagementGanttView } from "@/components/engagements/engagement-gantt-view";
import { BudgetBurndownChart } from "@/components/engagements/budget-burndown-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lucideManilaFolderOpen } from "@/lib/manilaFolder";
import { FolderOpen } from "lucide-react";
import Link from "next/link";

export default function EngagementDetailPage() {
  const params = useParams();
  const engagementId = params.id as string;
  
  const { data: engagement, isLoading, error, refetch } = useEngagementDetail(engagementId, {
    refetchOnMount: "always",
    staleTime: 0,
  });
  const { data: approvedHoursByWeek } = useApprovedHoursByWeek(engagementId, {
    enabled: !!engagementId,
  });
  const { data: opportunity } = useOpportunity(engagement?.opportunity_id || "", false);
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: billingTermsData } = useBillingTerms({ limit: 500, active_only: true });

  const getDeliveryCenterName = (dcId: string | undefined): string => {
    if (!dcId || !deliveryCentersData?.items) return dcId || "—";
    const dc = deliveryCentersData.items.find(d => d.id === dcId);
    return dc?.name || dcId;
  };

  const formatShortDate = (iso: string | undefined | null) => {
    if (!iso) return "—";
    const p = iso.split("T")[0].split("-").map(Number);
    if (p.length < 3) return "—";
    return new Date(p[0]!, p[1]! - 1, p[2]!).toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    });
  };

  const paymentTermsLabel = useMemo(() => {
    if (!opportunity?.billing_term_id || !billingTermsData?.items?.length) return "—";
    const t = billingTermsData.items.find((x) => x.id === opportunity.billing_term_id);
    return t?.name || "—";
  }, [opportunity?.billing_term_id, billingTermsData?.items]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading engagement...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !engagement) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">
              {error
                ? `Error loading engagement: ${error instanceof Error ? error.message : String(error)}`
                : "Engagement not found"}
            </p>
            <Link href="/engagements">
              <Button className="mt-4">Back to Engagements</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden min-w-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <Link href="/engagements" className="text-blue-600 hover:underline mb-2 inline-block">
            ← Back to Engagements
          </Link>
          <h1 className="text-3xl font-bold">Engagement - {engagement.opportunity_name || engagement.opportunity_id}</h1>
          <div className="text-sm text-gray-500 mt-1 space-y-1">
            {((engagement.account_name || opportunity?.account_name) ||
              engagement.quote_display_name ||
              engagement.quote_number) && (
              <p>
                {(engagement.account_name || opportunity?.account_name) && (
                  <>Account: {engagement.account_name || opportunity?.account_name}</>
                )}
                {(engagement.account_name || opportunity?.account_name) &&
                  (engagement.quote_display_name || engagement.quote_number) &&
                  " • "}
                {(engagement.quote_display_name || engagement.quote_number) && (
                  <>Quote: {engagement.quote_display_name || engagement.quote_number}</>
                )}
              </p>
            )}
            {engagement.opportunity_id ? (
              <p>
                Opportunity:{" "}
                <Link
                  href={`/opportunities/${engagement.opportunity_id}`}
                  className="text-blue-600 hover:underline"
                >
                  {engagement.opportunity_name || engagement.opportunity_id}
                </Link>
              </p>
            ) : (
              <p>
                Opportunity: {engagement.opportunity_name || "—"}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {engagement.opportunity_id && (
            <Link href={`/opportunities/${engagement.opportunity_id}?tab=documents`}>
              <Button
                variant="outline"
                size="sm"
                title="Open opportunity documents (SharePoint)"
                className="gap-1.5"
              >
                <FolderOpen className="w-4 h-4 shrink-0" {...lucideManilaFolderOpen} />
                Documents
              </Button>
            </Link>
          )}
          {engagement.estimate_id && (
            <Link href={`/estimates/${engagement.estimate_id}`}>
              <Button variant="outline" size="sm">
                View estimate
              </Button>
            </Link>
          )}
          {engagement.opportunity_id && (
            <Link href={`/opportunities/${engagement.opportunity_id}`}>
              <Button variant="outline" size="sm">
                View Opportunity
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Engagement Details Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Engagement Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {opportunity && (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">Opportunity start date:</span>
                  <span>{formatShortDate(opportunity.start_date)}</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">Opportunity end date:</span>
                  <span>{formatShortDate(opportunity.end_date)}</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2 sm:col-span-2">
                  <span className="font-semibold">Payment terms:</span>
                  <span>{paymentTermsLabel}</span>
                </div>
              </>
            )}
            {opportunity?.delivery_center_id && (
              <div className="flex items-center">
                <span className="font-semibold mr-2">Invoice Center:</span>
                <span>{getDeliveryCenterName(opportunity.delivery_center_id)}</span>
              </div>
            )}
            <div className="flex items-center">
              <span className="font-semibold mr-2">Invoice Currency:</span>
              <span>{opportunity?.default_currency || "USD"}</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold mr-2">Invoice Customer:</span>
              <span>{opportunity?.invoice_customer ? "Yes" : "No"}</span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold mr-2">Billable Expenses:</span>
              <span>{opportunity?.billable_expenses ? "Yes" : "No"}</span>
            </div>
            {engagement.description && (
              <div className="col-span-2">
                <span className="font-semibold">Description:</span> {engagement.description}
              </div>
            )}
            {engagement.quote_id && (
              <div className="col-span-2 border-t border-gray-200 pt-4 mt-2">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Quote</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Estimate: </span>
                    {engagement.estimate_id ? (
                      <Link
                        href={`/estimates/${engagement.estimate_id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {engagement.quote_display_name || engagement.quote_number || engagement.quote_id}
                      </Link>
                    ) : (
                      <span>
                        {engagement.quote_display_name || engagement.quote_number || engagement.quote_id}
                      </span>
                    )}
                  </div>
                  {engagement.comparative_summary && (
                    <>
                      {engagement.comparative_summary.quote_amount != null && (
                        <div>
                          <span className="font-medium text-gray-700">Quote amount: </span>
                          <span>
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: engagement.comparative_summary.currency || "USD",
                            }).format(
                              typeof engagement.comparative_summary.quote_amount === "string"
                                ? parseFloat(engagement.comparative_summary.quote_amount)
                                : Number(engagement.comparative_summary.quote_amount)
                            )}
                          </span>
                        </div>
                      )}
                      {engagement.comparative_summary.estimate_revenue != null && (
                        <div>
                          <span className="font-medium text-gray-700">Estimate revenue: </span>
                          <span>
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: engagement.comparative_summary.currency || "USD",
                            }).format(
                              typeof engagement.comparative_summary.estimate_revenue === "string"
                                ? parseFloat(engagement.comparative_summary.estimate_revenue)
                                : Number(engagement.comparative_summary.estimate_revenue)
                            )}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comparative Summary */}
      {engagement.comparative_summary && (
        <ComparativeSummary summary={engagement.comparative_summary} />
      )}

      {/* Phase Management */}
      <PhaseManagement engagementId={engagement.id} readOnly={false} />

      {/* Resource Plan */}
      <ResourcePlan 
        engagement={engagement} 
        opportunityDeliveryCenterId={opportunity?.delivery_center_id}
        opportunityCurrency={opportunity?.default_currency}
        invoiceCustomer={opportunity?.invoice_customer}
        billableExpenses={opportunity?.billable_expenses}
        onRefetch={refetch}
      />

      {/* Timesheet Approvers */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Timesheet Approver(s)</CardTitle>
        </CardHeader>
        <CardContent>
          <EngagementTimesheetApprovers engagement={engagement} onRefetch={refetch} />
        </CardContent>
      </Card>

      {/* Expense Approvers */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Expense Approver(s)</CardTitle>
        </CardHeader>
        <CardContent>
          <EngagementExpenseApprovers engagement={engagement} onRefetch={refetch} />
        </CardContent>
      </Card>

      {/* Timeline View */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Timeline View</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-hidden">
          <EngagementGanttView
            engagement={engagement}
            opportunityStartDate={opportunity?.start_date}
            opportunityEndDate={opportunity?.end_date}
          />
        </CardContent>
      </Card>

      {/* Budget Burndown Chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Budget Burndown</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetBurndownChart
            engagement={engagement}
            currency={opportunity?.default_currency || "USD"}
            approvedHoursByWeek={approvedHoursByWeek}
          />
        </CardContent>
      </Card>
    </div>
  );
}
