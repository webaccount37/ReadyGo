"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComparativeSummary } from "@/components/engagements/comparative-summary";
import { BudgetBurndownChart } from "@/components/engagements/budget-burndown-chart";
import { formatDurationDays } from "@/lib/duration-utils";
import type { Opportunity } from "@/types/opportunity";
import type { EngagementDetailResponse } from "@/types/engagement";
import type { ApprovedHoursByWeekResponse } from "@/types/engagement";
import type { OpportunityAverageDealValueResponse } from "@/types/opportunity";

interface OpportunityAnalyticsTabProps {
  opportunity: Opportunity;
  engagement?: EngagementDetailResponse | null;
  approvedHoursByWeek?: ApprovedHoursByWeekResponse | null;
  avgDealValue?: OpportunityAverageDealValueResponse | null;
}

export function OpportunityAnalyticsTab({
  opportunity,
  engagement,
  approvedHoursByWeek,
  avgDealValue,
}: OpportunityAnalyticsTabProps) {
  const dealCreationDate = opportunity.deal_creation_date
    ? new Date(opportunity.deal_creation_date)
    : null;
  const closeDate = opportunity.close_date ? new Date(opportunity.close_date) : null;
  const today = new Date();

  const totalAgeDays = dealCreationDate
    ? Math.floor((today.getTime() - dealCreationDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const daysToClose =
    dealCreationDate && closeDate
      ? Math.floor((closeDate.getTime() - dealCreationDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

  const dealValue = opportunity.deal_value
    ? parseFloat(String(opportunity.deal_value))
    : null;
  const avgValue = avgDealValue?.average_deal_value
    ? parseFloat(String(avgDealValue.average_deal_value))
    : null;
  const dealSizeVsAvgPercent =
    dealValue != null && avgValue != null && avgValue > 0
      ? ((dealValue / avgValue) * 100).toFixed(1)
      : null;

  const currency = opportunity.default_currency || "USD";

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Age
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalAgeDays != null ? formatDurationDays(totalAgeDays) : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Time since opportunity created
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Days to Close
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {daysToClose != null ? formatDurationDays(daysToClose) : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Creation date to close date
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Deal Size vs Avg (%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {dealSizeVsAvgPercent != null ? `${dealSizeVsAvgPercent}%` : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              vs avg deal value ({currency})
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget Comparison */}
      {!opportunity.engagement_id ? (
        <Card>
          <CardHeader>
            <CardTitle>Budget Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-700 bg-amber-50 px-4 py-3 rounded border border-amber-200">
              This opportunity has no active Engagement.
            </p>
          </CardContent>
        </Card>
      ) : engagement?.comparative_summary ? (
        <ComparativeSummary
          summary={engagement.comparative_summary}
          quoteEmptyMessage="This opportunity has no approved Quote"
          actualsEmptyMessage="This opportunity has no approved Timesheets"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Budget Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">Loading budget comparison...</p>
          </CardContent>
        </Card>
      )}

      {/* Budget Burndown */}
      <Card>
        <CardHeader>
          <CardTitle>Budget Burndown</CardTitle>
        </CardHeader>
        <CardContent>
          {!opportunity.engagement_id ? (
            <p className="text-sm text-amber-700 bg-amber-50 px-4 py-3 rounded border border-amber-200">
              This opportunity has no active Engagement. Budget burndown cannot be rendered.
            </p>
          ) : engagement ? (
            <BudgetBurndownChart
              engagement={engagement}
              currency={currency}
              approvedHoursByWeek={approvedHoursByWeek}
            />
          ) : (
            <p className="text-sm text-gray-500">Loading burndown chart...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
