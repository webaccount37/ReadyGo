"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ComparativeSummary } from "@/types/engagement";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface ComparativeSummaryProps {
  summary: ComparativeSummary;
}

export function ComparativeSummary({ summary }: ComparativeSummaryProps) {
  const formatCurrency = (amount: string | undefined) => {
    if (!amount) return "-";
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: summary.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatPercentage = (value: string | undefined) => {
    if (!value) return "-";
    const num = parseFloat(value);
    return `${num >= 0 ? "+" : ""}${num.toFixed(1)}%`;
  };

  // Determine if there are significant deviations
  const revenueDeviationPercent = summary.revenue_deviation_percentage 
    ? parseFloat(summary.revenue_deviation_percentage) 
    : 0;
  const marginDeviation = summary.margin_deviation 
    ? parseFloat(summary.margin_deviation) 
    : 0;

  // Thresholds for alerts (configurable)
  const REVENUE_DEVIATION_THRESHOLD = 5; // 5%
  const MARGIN_DEVIATION_THRESHOLD = 5; // 5 percentage points
  const REVENUE_AMOUNT_THRESHOLD = 10000; // $10k

  const hasSignificantRevenueDeviation = 
    Math.abs(revenueDeviationPercent) > REVENUE_DEVIATION_THRESHOLD ||
    (summary.revenue_deviation && Math.abs(parseFloat(summary.revenue_deviation)) > REVENUE_AMOUNT_THRESHOLD);
  
  const hasSignificantMarginDeviation = Math.abs(marginDeviation) > MARGIN_DEVIATION_THRESHOLD;

  const getDeviationColor = (deviation: number) => {
    if (Math.abs(deviation) <= REVENUE_DEVIATION_THRESHOLD) return "text-green-600";
    if (Math.abs(deviation) <= REVENUE_DEVIATION_THRESHOLD * 2) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Budget Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Quote/Estimate Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700">Quote/Estimate (Contract)</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Quote Amount:</span>
                <span className="text-sm font-semibold">{formatCurrency(summary.quote_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Estimate Cost:</span>
                <span className="text-sm">{formatCurrency(summary.estimate_cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Estimate Revenue:</span>
                <span className="text-sm">{formatCurrency(summary.estimate_revenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Estimate Margin Amount:</span>
                <span className="text-sm">{formatCurrency(summary.estimate_margin_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Estimate Margin %:</span>
                <span className="text-sm">
                  {summary.estimate_margin_percentage 
                    ? `${parseFloat(summary.estimate_margin_percentage).toFixed(1)}%`
                    : "-"}
                </span>
              </div>
            </div>
          </div>

          {/* Resource Plan Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700">Resource Plan (Budget)</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Resource Plan Revenue:</span>
                <span className={`text-sm font-semibold ${
                  hasSignificantRevenueDeviation ? "text-red-600" : "text-gray-900"
                }`}>
                  {formatCurrency(summary.resource_plan_revenue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Resource Plan Cost:</span>
                <span className="text-sm">{formatCurrency(summary.resource_plan_cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Resource Plan Margin Amount:</span>
                <span className="text-sm">{formatCurrency(summary.resource_plan_margin_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Resource Plan Margin %:</span>
                <span className={`text-sm ${
                  hasSignificantMarginDeviation ? "text-red-600" : "text-gray-900"
                }`}>
                  {summary.resource_plan_margin_percentage 
                    ? `${parseFloat(summary.resource_plan_margin_percentage).toFixed(1)}%`
                    : "-"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Deviations Section */}
        <div className="mt-6 pt-6 border-t">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Deviations</h3>
          <div className="space-y-3">
            {summary.revenue_deviation !== undefined && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  {hasSignificantRevenueDeviation ? (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  )}
                  <span className="text-sm font-medium">Revenue Deviation:</span>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${getDeviationColor(revenueDeviationPercent)}`}>
                    {formatCurrency(summary.revenue_deviation)}
                  </div>
                  {summary.revenue_deviation_percentage && (
                    <div className={`text-xs ${getDeviationColor(revenueDeviationPercent)}`}>
                      {formatPercentage(summary.revenue_deviation_percentage)}
                    </div>
                  )}
                </div>
              </div>
            )}
            {summary.margin_deviation !== undefined && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  {hasSignificantMarginDeviation ? (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  )}
                  <span className="text-sm font-medium">Margin Deviation:</span>
                </div>
                <div className={`text-sm font-semibold ${getDeviationColor(marginDeviation)}`}>
                  {formatPercentage(summary.margin_deviation)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Alert Banner for Significant Deviations */}
        {(hasSignificantRevenueDeviation || hasSignificantMarginDeviation) && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Budget Deviation Alert</p>
                <p className="text-sm text-red-700 mt-1">
                  The Resource Plan budget deviates significantly from the Quote contract. 
                  Please review and adjust the Resource Plan to align with the approved Quote.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
