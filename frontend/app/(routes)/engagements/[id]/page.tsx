"use client";

import { useParams } from "next/navigation";
import { useEngagementDetail } from "@/hooks/useEngagements";
import { useOpportunity } from "@/hooks/useOpportunities";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { ResourcePlan } from "@/components/engagements/resource-plan";
import { PhaseManagement } from "@/components/engagements/phase-management";
import { ComparativeSummary } from "@/components/engagements/comparative-summary";
import { EngagementTimesheetApprovers } from "@/components/engagements/engagement-timesheet-approvers";
import { EngagementGanttView } from "@/components/engagements/engagement-gantt-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Lock } from "lucide-react";

export default function EngagementDetailPage() {
  const params = useParams();
  const engagementId = params.id as string;
  
  const { data: engagement, isLoading, error, refetch } = useEngagementDetail(engagementId, {
    refetchOnMount: "always",
    staleTime: 0,
  });
  
  const { data: opportunity } = useOpportunity(engagement?.opportunity_id || "", false);
  const { data: deliveryCentersData } = useDeliveryCenters();

  const getDeliveryCenterName = (dcId: string | undefined): string => {
    if (!dcId || !deliveryCentersData?.items) return dcId || "—";
    const dc = deliveryCentersData.items.find(d => d.id === dcId);
    return dc?.name || dcId;
  };

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
          <p className="text-sm text-gray-500 mt-1">
            {(engagement.account_name || opportunity?.account_name) && (
              <>Account: {engagement.account_name || opportunity?.account_name} • </>
            )}
            Opportunity: {engagement.opportunity_name || engagement.opportunity_id}
            {(engagement.quote_display_name || engagement.quote_number) && ` • Quote: ${engagement.quote_display_name || engagement.quote_number}`}
          </p>
        </div>
        <div className="flex gap-2">
          {engagement.quote_id && (
            <Link href={`/quotes/${engagement.quote_id}`}>
              <Button variant="outline" size="sm">
                View Quote
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
    </div>
  );
}
