"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuoteDetail, useDeactivateQuote } from "@/hooks/useQuotes";
import { useOpportunity } from "@/hooks/useOpportunities";
import { useAccounts } from "@/hooks/useAccounts";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useState, useMemo } from "react";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { UnlockDialog } from "@/components/quotes/unlock-dialog";
import { Lock, FileText } from "lucide-react";
import { QuoteReadonlyTable } from "@/components/quotes/quote-readonly-table";

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;
  const { data: quote, isLoading, error, refetch } = useQuoteDetail(quoteId);
  const deactivateQuote = useDeactivateQuote();
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
  
  // Fetch opportunity for date range
  const { data: opportunity } = useOpportunity(quote?.opportunity_id || "", false, {
    enabled: !!quote?.opportunity_id,
  });

  // Fetch accounts and delivery centers for lookup
  const { data: accountsData } = useAccounts({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();

  // Helper function to get account name
  const getAccountName = (accountId: string | undefined): string => {
    if (!accountId) return "—";
    // First try snapshot_data
    if (quote?.snapshot_data?.account_name && typeof quote.snapshot_data.account_name === "string") {
      return quote.snapshot_data.account_name;
    }
    // Then try opportunity account_name
    if (opportunity?.account_name) {
      return opportunity.account_name;
    }
    // Finally lookup by ID
    const account = accountsData?.items.find((a) => a.id === accountId);
    return account?.company_name || accountId;
  };

  // Helper function to get delivery center name
  const getDeliveryCenterName = (dcId: string | undefined): string => {
    if (!dcId) return "—";
    // First try snapshot_data
    if (quote?.snapshot_data?.delivery_center_name && typeof quote.snapshot_data.delivery_center_name === "string") {
      return quote.snapshot_data.delivery_center_name;
    }
    // Then lookup by ID from opportunity
    const dc = deliveryCentersData?.items.find((d) => d.id === dcId);
    return dc?.name || dcId;
  };

  // Helper function to safely get currency from snapshot_data or opportunity
  const getCurrency = (): string => {
    if (quote?.snapshot_data?.default_currency && typeof quote.snapshot_data.default_currency === "string") {
      return quote.snapshot_data.default_currency;
    }
    if (opportunity?.default_currency) {
      return opportunity.default_currency;
    }
    return "USD";
  };

  // Calculate estimate summary from quote's snapshot line items
  const estimateSummary = useMemo(() => {
    if (!quote?.line_items || !opportunity) return null;
    
    const parseLocalDate = (dateStr: string): Date => {
      const datePart = dateStr.split("T")[0];
      const [year, month, day] = datePart.split("-").map(Number);
      return new Date(year, month - 1, day);
    };
    
    const formatDateKey = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    
    // Generate weeks from opportunity start/end dates
    const weeks: Date[] = [];
    if (!opportunity.start_date || !opportunity.end_date) {
      return null;
    }
    const startDate = parseLocalDate(opportunity.start_date);
    const endDate = parseLocalDate(opportunity.end_date);
    
    // Find first Sunday
    const current = new Date(startDate);
    const dayOfWeek = current.getDay();
    const diff = current.getDate() - dayOfWeek;
    current.setDate(diff);
    
    while (current <= endDate) {
      const weekStart = new Date(current);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      if (weekStart <= endDate && weekEnd >= startDate) {
        weeks.push(new Date(weekStart));
      }
      current.setDate(current.getDate() + 7);
    }
    
    // Calculate totals from quote's snapshot line items
    let totalCost = 0;
    let totalRevenue = 0;
    let totalHours = 0;
    
    quote.line_items.forEach((item) => {
      const itemHours = weeks.reduce((hoursSum, week) => {
        const weekKey = formatDateKey(week);
        const weekDate = week;
        const itemStartDate = parseLocalDate(item.start_date);
        const itemEndDate = parseLocalDate(item.end_date);
        const weekEnd = new Date(weekDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        if (weekDate <= itemEndDate && weekEnd >= itemStartDate) {
          const weeklyHour = item.weekly_hours?.find((wh) => {
            const whDate = parseLocalDate(wh.week_start_date);
            return formatDateKey(whDate) === weekKey;
          });
          return hoursSum + parseFloat(weeklyHour?.hours || "0");
        }
        return hoursSum;
      }, 0);
      
      const itemCost = itemHours * parseFloat(item.cost || "0");
      // If billable is false, revenue should be 0 (non-billable roles don't generate revenue)
      const itemRevenue = item.billable ? itemHours * parseFloat(item.rate || "0") : 0;
      
      totalCost += itemCost;
      totalRevenue += itemRevenue;
      // For blended rate calculations, only include hours from billable rows
      // Non-billable hours don't generate revenue, so they shouldn't be multiplied by blended rate
      totalHours += item.billable ? itemHours : 0;
    });
    
    const marginAmount = totalRevenue - totalCost;
    const marginPercentage = totalRevenue > 0 ? (marginAmount / totalRevenue) * 100 : 0;
    
    return {
      totalCost,
      totalRevenue,
      totalHours,
      marginAmount,
      marginPercentage,
      currency: getCurrency(),
    };
  }, [quote, opportunity]);

  // Calculate quote total
  const quoteTotal = useMemo(() => {
    if (!quote?.quote_type || !estimateSummary) return 0;
    
    if (quote.quote_type === "FIXED_BID") {
      return parseFloat(quote.target_amount || "0");
    } else if (quote.quote_type === "TIME_MATERIALS") {
      // If blended rate is selected, calculate: total hours * blended rate
      if (quote.rate_billing_unit === "HOURLY_BLENDED" || quote.rate_billing_unit === "DAILY_BLENDED") {
        const blendedRate = parseFloat(quote.blended_rate_amount || "0");
        const totalHours = estimateSummary.totalHours || 0;
        return totalHours * blendedRate;
      }
      // Otherwise use estimate total revenue
      return estimateSummary.totalRevenue;
    }
    return 0;
  }, [quote, estimateSummary]);

  // Calculate variable compensation impact
  const variableCompensationImpact = useMemo(() => {
    if (!quote?.variable_compensations || !quote.variable_compensations.length || !estimateSummary) return 0;
    
    return quote.variable_compensations.reduce((sum, comp) => {
      const percentage = parseFloat(comp.percentage_amount || "0") / 100;
      if (comp.revenue_type === "GROSS_REVENUE") {
        return sum + (quoteTotal * percentage);
      } else {
        // GROSS_MARGIN
        const margin = estimateSummary.marginAmount;
        return sum + (margin * percentage);
      }
    }, 0);
  }, [quote, estimateSummary, quoteTotal]);

  // Format currency helper
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: getCurrency(),
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

  const handleDeactivate = async () => {
    if (!quote) return;
    
    try {
      await deactivateQuote.mutateAsync(quote.id);
      router.push("/quotes");
    } catch (err) {
      console.error("Failed to deactivate quote:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading quote...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">
              {error ? `Error: ${error.message}` : "Quote not found"}
            </p>
            <Link href="/quotes">
              <Button className="mt-4">Back to Quotes</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
                <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {quote.display_name}
              </CardTitle>
              <div className="flex items-center gap-4 mt-2">
                <QuoteStatusBadge status={quote.status} />
                {quote.is_active && (
                  <span className="flex items-center gap-1 text-green-600 text-sm">
                    <Lock className="h-4 w-4" />
                    Active (Locking Opportunity)
                  </span>
                )}
                {opportunity?.is_permanently_locked && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-sm font-medium">
                    <Lock className="h-4 w-4" />
                    Permanently locked
                  </span>
                )}
                <span className="text-sm text-gray-500">
                  Version {quote.version}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {quote.is_active && !opportunity?.is_permanently_locked && (
                <Button
                  variant="destructive"
                  onClick={() => setIsUnlockDialogOpen(true)}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Unlock
                </Button>
              )}
              <Button 
                variant="outline"
                onClick={() => router.push(`/opportunities?opportunity_id=${quote.opportunity_id}`)}
              >
                View Opportunity
              </Button>
              <Link href={`/estimates/${quote.estimate_id}`}>
                <Button variant="outline">View Estimate</Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Opportunity</p>
              <p className="font-medium">{quote.opportunity_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Source Estimate</p>
              <p className="font-medium">{quote.estimate_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Account Name</p>
              <p className="font-medium">
                {getAccountName(opportunity?.account_id || quote.snapshot_data?.account_id as string | undefined)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Invoice Center</p>
              <p className="font-medium">
                {getDeliveryCenterName(opportunity?.delivery_center_id || quote.snapshot_data?.delivery_center_id as string | undefined)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Invoice Currency</p>
              <p className="font-medium">{getCurrency()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Created</p>
              <p className="font-medium">
                {formatLocalDate(quote.created_at)}
                {quote.created_by_name && ` by ${quote.created_by_name}`}
              </p>
            </div>
            {quote.sent_date && (
              <div>
                <p className="text-sm text-gray-500">Sent Date</p>
                <p className="font-medium">
                  {formatLocalDate(quote.sent_date)}
                </p>
              </div>
            )}
          </div>

          {quote.notes && (
            <div className="mt-4">
              <p className="text-sm text-gray-500">Notes</p>
              <p className="mt-1">{quote.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Estimate vs Quote Comparison */}
      {quote.quote_type && estimateSummary && (
        <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50">
          <CardHeader className="bg-indigo-100/50">
            <CardTitle className="text-lg text-indigo-900">Quote vs Estimate Comparison</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-lg p-4 border border-indigo-200">
                <h4 className="font-semibold mb-3 text-indigo-900">Estimate</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Cost:</span>
                    <span className="text-sm font-semibold">{formatCurrency(estimateSummary.totalCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Revenue:</span>
                    <span className="text-sm font-semibold text-green-700">{formatCurrency(estimateSummary.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Margin Amount:</span>
                    <span className="text-sm font-semibold text-purple-700">{formatCurrency(estimateSummary.marginAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-sm font-medium text-gray-700">Margin %:</span>
                    <span className="text-sm font-bold text-orange-700">{estimateSummary.marginPercentage.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 border border-indigo-200">
                <h4 className="font-semibold mb-3 text-indigo-900">
                  {quote.quote_type === "FIXED_BID" ? "Fixed Bid Quote" : "Time & Materials Quote"}
                </h4>
                <div className="space-y-2">
                  {quote.quote_type === "FIXED_BID" ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Fixed Bid Total:</span>
                        <span className="text-sm font-semibold text-green-700">{formatCurrency(quoteTotal)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-sm font-medium text-gray-700">Difference:</span>
                        <span className={`text-sm font-bold ${quoteTotal - estimateSummary.totalRevenue >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {formatCurrency(quoteTotal - estimateSummary.totalRevenue)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Total Revenue:</span>
                        <span className="text-sm font-semibold text-green-700">{formatCurrency(quoteTotal)}</span>
                      </div>
                      {(quote.rate_billing_unit === "HOURLY_BLENDED" || quote.rate_billing_unit === "DAILY_BLENDED") ? (
                        <div className="mt-2 text-xs text-gray-600 space-y-1">
                          <p>Blended Rate: {formatCurrency(parseFloat(quote.blended_rate_amount || "0"))}</p>
                          <p>Total Hours: {estimateSummary.totalHours.toFixed(2)}</p>
                          <p className="mt-1 font-medium text-indigo-700">Quote Total = Hours × Blended Rate</p>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic">(Same as Estimate)</p>
                      )}
                    </>
                  )}
                  {quote.variable_compensations && quote.variable_compensations.length > 0 && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-sm font-medium text-gray-700">Variable Compensation:</span>
                      <span className="text-sm font-bold text-emerald-700">{formatCurrency(variableCompensationImpact)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Estimate Phases */}
      {quote.phases && quote.phases.length > 0 && (
        <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <CardHeader className="bg-purple-100/50">
            <CardTitle className="text-lg text-purple-900">Active Estimate Phases</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-2">
              {quote.phases
                .sort((a, b) => a.row_order - b.row_order)
                .map((phase) => (
                  <div
                    key={phase.id}
                    className="flex items-center gap-4 p-3 border rounded-lg bg-white"
                    style={{ borderLeftColor: phase.color, borderLeftWidth: "4px" }}
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-purple-900">{phase.name}</div>
                      <div className="text-sm text-gray-600">
                        {formatLocalDate(phase.start_date)} - {formatLocalDate(phase.end_date)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quote Type and Configuration */}
      {quote.quote_type && (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader className="bg-blue-100/50">
            <CardTitle className="text-lg text-blue-900">Quote Configuration</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500">Quote Type</p>
                <p className="font-medium text-blue-900">
                  {quote.quote_type === "FIXED_BID" ? "Fixed Bid" : "Time & Materials"}
                </p>
              </div>
            </div>

            {/* Fixed Bid Configuration */}
            {quote.quote_type === "FIXED_BID" && (
              <div className="space-y-4">
                {quote.target_amount && (
                  <div>
                    <p className="text-sm text-gray-500">Target Amount</p>
                    <p className="font-medium text-lg">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: getCurrency(),
                      }).format(parseFloat(quote.target_amount))}
                    </p>
                  </div>
                )}

                {quote.payment_triggers && quote.payment_triggers.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2 font-medium">Payment Triggers</p>
                    <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                      <table className="w-full">
                        <thead className="bg-blue-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Type</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Time/Milestone</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quote.payment_triggers
                            .sort((a, b) => (a.row_order || 0) - (b.row_order || 0))
                            .map((trigger) => (
                              <tr key={trigger.id} className="border-t border-blue-100">
                                <td className="px-3 py-2 text-sm">{trigger.name}</td>
                                <td className="px-3 py-2 text-sm">{trigger.trigger_type}</td>
                                <td className="px-3 py-2 text-sm">
                                  {trigger.trigger_type === "TIME" ? (
                                    <>
                                      {trigger.time_type}
                                      {trigger.time_type === "MONTHLY" && trigger.num_installments && (
                                        <span className="text-gray-500"> ({trigger.num_installments} installments)</span>
                                      )}
                                    </>
                                  ) : (
                                    trigger.milestone_date && formatLocalDate(trigger.milestone_date)
                                  )}
                                </td>
                                <td className="px-3 py-2 text-sm font-medium">
                                  {new Intl.NumberFormat("en-US", {
                                    style: "currency",
                                    currency: getCurrency(),
                                  }).format(parseFloat(trigger.amount))}
                                  {trigger.trigger_type === "TIME" && trigger.time_type === "MONTHLY" && trigger.num_installments && (
                                    <span className="text-gray-500">
                                      {" "}× {trigger.num_installments} = {new Intl.NumberFormat("en-US", {
                                        style: "currency",
                                        currency: getCurrency(),
                                      }).format(parseFloat(trigger.amount) * trigger.num_installments)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 p-2 bg-blue-100 rounded">
                      <p className="text-sm font-medium text-blue-900">
                        Total: {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: getCurrency(),
                        }).format(
                          quote.payment_triggers.reduce((sum, trigger) => {
                            if (trigger.trigger_type === "TIME" && trigger.time_type === "MONTHLY" && trigger.num_installments) {
                              return sum + parseFloat(trigger.amount) * trigger.num_installments;
                            }
                            return sum + parseFloat(trigger.amount);
                          }, 0)
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Time & Materials Configuration */}
            {quote.quote_type === "TIME_MATERIALS" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {quote.rate_billing_unit && (
                    <div>
                      <p className="text-sm text-gray-500">Rate Billing Unit</p>
                      <p className="font-medium">
                        {quote.rate_billing_unit === "HOURLY_ACTUALS" && "Hourly @ Actuals"}
                        {quote.rate_billing_unit === "DAILY_ACTUALS" && "Daily @ Actuals"}
                        {quote.rate_billing_unit === "HOURLY_BLENDED" && "Hourly @ Blended Rate"}
                        {quote.rate_billing_unit === "DAILY_BLENDED" && "Daily @ Blended Rate"}
                      </p>
                    </div>
                  )}
                  {quote.invoice_detail && (
                    <div>
                      <p className="text-sm text-gray-500">Invoice Detail</p>
                      <p className="font-medium">
                        {quote.invoice_detail === "ROLE" && "Role"}
                        {quote.invoice_detail === "EMPLOYEE" && "Employee"}
                        {quote.invoice_detail === "EMPLOYEE_WITH_DESCRIPTIONS" && "Employee w/ Descriptions"}
                      </p>
                    </div>
                  )}
                </div>

                {(quote.rate_billing_unit === "HOURLY_BLENDED" || quote.rate_billing_unit === "DAILY_BLENDED") && quote.blended_rate_amount && (
                  <div>
                    <p className="text-sm text-gray-500">Blended Rate Amount</p>
                    <p className="font-medium text-lg">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: getCurrency(),
                      }).format(parseFloat(quote.blended_rate_amount))}
                    </p>
                  </div>
                )}

                {quote.cap_type && quote.cap_type !== "NONE" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Cap Type</p>
                      <p className="font-medium">
                        {quote.cap_type === "CAPPED" && "Capped (Not to Exceed)"}
                        {quote.cap_type === "FLOOR" && "Floor (Minimum Spend)"}
                      </p>
                    </div>
                    {quote.cap_amount && (
                      <div>
                        <p className="text-sm text-gray-500">Cap Amount</p>
                        <p className="font-medium text-lg">
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: getCurrency(),
                          }).format(parseFloat(quote.cap_amount))}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Variable Compensations */}
            {quote.variable_compensations && quote.variable_compensations.length > 0 && (
              <div className="mt-6 pt-6 border-t border-blue-200">
                <p className="text-sm text-gray-500 mb-2 font-medium">Variable Compensation</p>
                <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                  <table className="w-full">
                    <thead className="bg-blue-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Employee</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Revenue Type</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.variable_compensations.map((comp) => (
                        <tr key={comp.id} className="border-t border-blue-100">
                          <td className="px-3 py-2 text-sm">{comp.employee_name || comp.employee_id}</td>
                          <td className="px-3 py-2 text-sm">
                            {comp.revenue_type === "GROSS_REVENUE" ? "Gross Revenue" : "Gross Margin"}
                          </td>
                          <td className="px-3 py-2 text-sm font-medium">{parseFloat(comp.percentage_amount).toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Snapshot Data Display */}
      <Card>
        <CardHeader>
          <CardTitle>Quote Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            This is a read-only snapshot of the estimate data at the time the quote was created.
          </p>
          <QuoteReadonlyTable quote={quote} />
        </CardContent>
      </Card>

      {/* Unlock Dialog */}
      <UnlockDialog
        open={isUnlockDialogOpen}
        onOpenChange={setIsUnlockDialogOpen}
        quote={quote}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}

