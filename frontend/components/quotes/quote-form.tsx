"use client";

import { useState, useEffect, useMemo } from "react";
import { useCreateQuote } from "@/hooks/useQuotes";
import { useOpportunity, useOpportunities } from "@/hooks/useOpportunities";
import { useEstimateDetail, useEstimates } from "@/hooks/useEstimates";
import { useEmployees } from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import type { QuoteCreate, PaymentTriggerCreate, VariableCompensationCreate, QuoteType, PaymentTriggerType, TimeType, RevenueType, RateBillingUnit, InvoiceDetail, CapType } from "@/types/quote";
import { Trash2, Plus, AlertTriangle } from "lucide-react";

export function QuoteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createQuote = useCreateQuote();
  
  const opportunityIdParam = searchParams.get("opportunity_id");
  const [opportunityId, setOpportunityId] = useState<string>(opportunityIdParam || "");
  const [estimateId, setEstimateId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [quoteType, setQuoteType] = useState<QuoteType | "">("");
  
  // Fixed Bid fields
  const [targetAmount, setTargetAmount] = useState<string>("");
  const [paymentTriggers, setPaymentTriggers] = useState<PaymentTriggerCreate[]>([]);
  
  // Time & Materials fields
  const [rateBillingUnit, setRateBillingUnit] = useState<RateBillingUnit | "">("");
  const [blendedRateAmount, setBlendedRateAmount] = useState<string>("");
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | "">("");
  const [capType, setCapType] = useState<CapType>("NONE");
  const [capAmount, setCapAmount] = useState<string>("");
  
  // Variable Compensation
  const [variableCompensations, setVariableCompensations] = useState<VariableCompensationCreate[]>([]);

  // Fetch all opportunities for the dropdown
  const { data: opportunitiesData } = useOpportunities({ limit: 1000 });
  
  // Fetch selected opportunity to get its active estimate
  const { data: opportunity } = useOpportunity(opportunityId, false, { enabled: !!opportunityId });
  const { data: estimatesData } = useEstimates({
    opportunity_id: opportunityId,
    limit: 100,
  }, { enabled: !!opportunityId });
  
  // Fetch estimate detail for summary calculation
  const { data: estimateDetail } = useEstimateDetail(estimateId, { enabled: !!estimateId });
  
  // Fetch employees for variable compensation
  const { data: employeesData } = useEmployees({ limit: 1000 });

  // Set default estimate to active estimate when opportunity changes
  useEffect(() => {
    if (opportunityId && estimatesData?.items) {
      const activeEstimate = estimatesData.items.find((e) => e.active_version);
      if (activeEstimate) {
        setEstimateId(activeEstimate.id);
      } else {
        setEstimateId("");
      }
    } else {
      setEstimateId("");
    }
  }, [opportunityId, estimatesData]);

  // Calculate estimate summary
  const estimateSummary = useMemo(() => {
    if (!estimateDetail?.line_items || !opportunity) return null;
    
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
    
    // Calculate totals similar to EstimateTotalsRow
    let totalCost = 0;
    let totalRevenue = 0;
    let totalHours = 0;
    
    estimateDetail.line_items.forEach((item) => {
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
      const itemRevenue = itemHours * parseFloat(item.rate || "0");
      
      totalCost += itemCost;
      totalRevenue += itemRevenue;
      totalHours += itemHours;
    });
    
    const marginAmount = totalRevenue - totalCost;
    const marginPercentage = totalRevenue > 0 ? (marginAmount / totalRevenue) * 100 : 0;
    
    return {
      totalCost,
      totalRevenue,
      totalHours,
      marginAmount,
      marginPercentage,
      currency: opportunity.default_currency || "USD",
    };
  }, [estimateDetail, opportunity]);

  // Calculate payment trigger total
  const paymentTriggerTotal = useMemo(() => {
    return paymentTriggers.reduce((sum, trigger) => {
      if (trigger.trigger_type === "TIME" && trigger.time_type === "MONTHLY" && trigger.num_installments) {
        return sum + parseFloat(trigger.amount || "0") * trigger.num_installments;
      }
      return sum + parseFloat(trigger.amount || "0");
    }, 0);
  }, [paymentTriggers]);

  // Calculate quote total (Fixed Bid) or use estimate total (Time & Materials)
  const quoteTotal = useMemo(() => {
    if (quoteType === "FIXED_BID") {
      return parseFloat(targetAmount || "0");
    } else if (quoteType === "TIME_MATERIALS") {
      // If blended rate is selected, calculate: total hours * blended rate
      if (rateBillingUnit === "HOURLY_BLENDED" || rateBillingUnit === "DAILY_BLENDED") {
        const blendedRate = parseFloat(blendedRateAmount || "0");
        const totalHours = estimateSummary?.totalHours || 0;
        return totalHours * blendedRate;
      }
      // Otherwise use estimate total revenue
      return estimateSummary?.totalRevenue || 0;
    }
    return 0;
  }, [quoteType, targetAmount, estimateSummary, rateBillingUnit, blendedRateAmount]);

  // Calculate variable compensation impact
  const variableCompensationImpact = useMemo(() => {
    if (!variableCompensations.length || !estimateSummary) return 0;
    
    return variableCompensations.reduce((sum, comp) => {
      const percentage = parseFloat(comp.percentage_amount || "0");
      if (comp.revenue_type === "GROSS_REVENUE") {
        return sum + (quoteTotal * percentage / 100);
      } else {
        // GROSS_MARGIN
        const margin = estimateSummary.marginAmount;
        return sum + (margin * percentage / 100);
      }
    }, 0);
  }, [variableCompensations, quoteTotal, estimateSummary]);

  const addPaymentTrigger = () => {
    setPaymentTriggers([...paymentTriggers, {
      name: "",
      trigger_type: "TIME",
      time_type: "IMMEDIATE",
      amount: "0",
      row_order: paymentTriggers.length,
    }]);
  };

  const removePaymentTrigger = (index: number) => {
    setPaymentTriggers(paymentTriggers.filter((_, i) => i !== index));
  };

  const updatePaymentTrigger = (index: number, updates: Partial<PaymentTriggerCreate>) => {
    const updated = [...paymentTriggers];
    updated[index] = { ...updated[index], ...updates };
    setPaymentTriggers(updated);
  };

  const distributeTargetAmount = () => {
    if (!targetAmount || paymentTriggers.length === 0) return;
    
    const target = parseFloat(targetAmount);
    // Count total payment instances (MONTHLY installments count separately)
    let totalInstances = 0;
    paymentTriggers.forEach(trigger => {
      if (trigger.trigger_type === "TIME" && trigger.time_type === "MONTHLY" && trigger.num_installments) {
        totalInstances += trigger.num_installments;
      } else {
        totalInstances += 1;
      }
    });
    
    if (totalInstances === 0) return;
    
    const amountPerInstance = target / totalInstances;
    const updated = paymentTriggers.map(trigger => {
      if (trigger.trigger_type === "TIME" && trigger.time_type === "MONTHLY") {
        return { ...trigger, amount: amountPerInstance.toFixed(2) };
      }
      return { ...trigger, amount: amountPerInstance.toFixed(2) };
    });
    setPaymentTriggers(updated);
  };

  const addVariableCompensation = () => {
    setVariableCompensations([...variableCompensations, {
      employee_id: "",
      revenue_type: "GROSS_MARGIN",
      percentage_amount: "0",
    }]);
  };

  const removeVariableCompensation = (index: number) => {
    setVariableCompensations(variableCompensations.filter((_, i) => i !== index));
  };

  const updateVariableCompensation = (index: number, updates: Partial<VariableCompensationCreate>) => {
    const updated = [...variableCompensations];
    updated[index] = { ...updated[index], ...updates };
    setVariableCompensations(updated);
  };

  const handleDefaultFromEstimate = () => {
    if (!estimateSummary || !opportunity) {
      return;
    }

    // Set target amount to estimate total revenue
    const targetAmountValue = estimateSummary.totalRevenue.toFixed(2);
    setTargetAmount(targetAmountValue);

    // Get phases from estimate detail
    const phases = estimateDetail?.phases || [];
    
    let newTriggers: PaymentTriggerCreate[] = [];

    if (phases.length > 0) {
      // Create milestone triggers for each phase
      newTriggers = phases
        .sort((a, b) => (a.row_order || 0) - (b.row_order || 0))
        .map((phase, index) => ({
          name: phase.name,
          trigger_type: "MILESTONE" as PaymentTriggerType,
          milestone_date: phase.end_date.split("T")[0], // Use phase end date
          amount: "0", // Will be distributed
          row_order: index,
        }));
    } else {
      // No phases - create single "Default" milestone with opportunity end date
      if (opportunity.end_date) {
        newTriggers = [{
          name: "Default",
          trigger_type: "MILESTONE" as PaymentTriggerType,
          milestone_date: opportunity.end_date.split("T")[0],
          amount: "0", // Will be distributed
          row_order: 0,
        }];
      }
    }

    // Distribute target amount across triggers
    if (newTriggers.length > 0 && targetAmountValue) {
      const target = parseFloat(targetAmountValue);
      const amountPerTrigger = (target / newTriggers.length).toFixed(2);
      newTriggers = newTriggers.map(trigger => ({
        ...trigger,
        amount: amountPerTrigger,
      }));
    }

    setPaymentTriggers(newTriggers);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!opportunityId || !estimateId) {
      alert("Please select an opportunity and estimate");
      return;
    }
    
    if (!quoteType) {
      alert("Please select a quote type");
      return;
    }
    
    if (quoteType === "FIXED_BID") {
      if (!targetAmount || parseFloat(targetAmount) <= 0) {
        alert("Please enter a target amount for Fixed Bid quotes");
        return;
      }
      if (paymentTriggers.length === 0) {
        alert("Fixed Bid quotes require at least one payment trigger");
        return;
      }
      const total = paymentTriggerTotal;
      const target = parseFloat(targetAmount);
      if (Math.abs(total - target) > 0.01) {
        alert(`Payment trigger total (${total.toFixed(2)}) must equal target amount (${target.toFixed(2)})`);
        return;
      }
    } else if (quoteType === "TIME_MATERIALS") {
      if (rateBillingUnit === "HOURLY_BLENDED" || rateBillingUnit === "DAILY_BLENDED") {
        if (!blendedRateAmount || parseFloat(blendedRateAmount) <= 0) {
          alert("Please enter a blended rate amount for blended rate billing units");
          return;
        }
      }
      if (capType !== "NONE" && (!capAmount || parseFloat(capAmount) <= 0)) {
        alert(`Please enter a cap amount for ${capType} cap type`);
        return;
      }
    }
    
    // Validate variable compensations
    for (const comp of variableCompensations) {
      if (!comp.employee_id) {
        alert("Please select an employee for all variable compensations");
        return;
      }
      const percentage = parseFloat(comp.percentage_amount || "0");
      if (percentage < 0 || percentage > 100) {
        alert("Variable compensation percentage must be between 0 and 100");
        return;
      }
    }

    try {
      const quoteData: QuoteCreate = {
        opportunity_id: opportunityId,
        estimate_id: estimateId,
        notes: notes || undefined,
        quote_type: quoteType,
        target_amount: quoteType === "FIXED_BID" ? targetAmount : undefined,
        rate_billing_unit: quoteType === "TIME_MATERIALS" ? (rateBillingUnit || undefined) : undefined,
        blended_rate_amount: quoteType === "TIME_MATERIALS" && (rateBillingUnit === "HOURLY_BLENDED" || rateBillingUnit === "DAILY_BLENDED") ? blendedRateAmount : undefined,
        invoice_detail: quoteType === "TIME_MATERIALS" ? (invoiceDetail || undefined) : undefined,
        cap_type: quoteType === "TIME_MATERIALS" ? (capType === "NONE" ? undefined : capType) : undefined,
        cap_amount: quoteType === "TIME_MATERIALS" && capType !== "NONE" ? capAmount : undefined,
        payment_triggers: quoteType === "FIXED_BID" ? paymentTriggers : undefined,
        variable_compensations: variableCompensations.length > 0 ? variableCompensations : undefined,
      };
      
      const quote = await createQuote.mutateAsync(quoteData);
      router.push(`/quotes/${quote.id}`);
    } catch (err) {
      console.error("Failed to create quote:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const currency = opportunity?.default_currency || "USD";
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <Card className="border-blue-200 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
          <CardTitle className="text-2xl">Create Quote</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Opportunity and Estimate Selection */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="opportunity_id">Opportunity *</Label>
                <Select
                  id="opportunity_id"
                  value={opportunityId}
                  onChange={(e) => setOpportunityId(e.target.value)}
                  required
                >
                  <option value="">Select an opportunity</option>
                  {opportunitiesData?.items?.map((opp) => (
                    <option key={opp.id} value={opp.id}>
                      {opp.name}
                      {opp.account_name && ` - ${opp.account_name}`}
                    </option>
                  ))}
                </Select>
                {opportunity && (
                  <p className="text-sm text-gray-500 mt-1">
                    {opportunity.account_name && `Account: ${opportunity.account_name}`}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="estimate_id">Estimate *</Label>
                {(() => {
                  const activeEstimate = estimatesData?.items?.find((e) => e.active_version);
                  
                  if (!opportunityId) {
                    return (
                      <select
                        id="estimate_id"
                        disabled
                        className="w-full border rounded px-3 py-2 bg-gray-100"
                      >
                        <option value="">Select an opportunity first</option>
                      </select>
                    );
                  }
                  
                  if (!activeEstimate) {
                    return (
                      <>
                        <select
                          id="estimate_id"
                          disabled
                          className="w-full border rounded px-3 py-2 bg-gray-100"
                        >
                          <option value="">No active estimate found</option>
                        </select>
                        <p className="text-sm text-red-500 mt-1">
                          This opportunity does not have an active estimate. Please set an active estimate before creating a quote.
                        </p>
                      </>
                    );
                  }
                  
                  return (
                    <>
                      <select
                        id="estimate_id"
                        value={estimateId}
                        onChange={(e) => setEstimateId(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                        required
                      >
                        <option value={activeEstimate.id}>
                          {activeEstimate.name} (Active)
                        </option>
                      </select>
                      <p className="text-sm text-gray-500 mt-1">
                        Only the active estimate can be used to create a quote.
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Estimate Summary */}
            {estimateSummary && (
              <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardHeader className="bg-blue-100/50">
                  <CardTitle className="text-lg text-blue-900">Estimate Summary</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg p-4 border border-blue-200">
                      <p className="text-sm text-blue-600 font-medium">Total Cost</p>
                      <p className="text-xl font-bold text-blue-900 mt-1">{formatCurrency(estimateSummary.totalCost)}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-green-200">
                      <p className="text-sm text-green-600 font-medium">Total Revenue</p>
                      <p className="text-xl font-bold text-green-900 mt-1">{formatCurrency(estimateSummary.totalRevenue)}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-purple-200">
                      <p className="text-sm text-purple-600 font-medium">Margin Amount</p>
                      <p className="text-xl font-bold text-purple-900 mt-1">{formatCurrency(estimateSummary.marginAmount)}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 border border-orange-200">
                      <p className="text-sm text-orange-600 font-medium">Margin %</p>
                      <p className="text-xl font-bold text-orange-900 mt-1">{estimateSummary.marginPercentage.toFixed(2)}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Active Estimate Phases */}
            {estimateDetail?.phases && estimateDetail.phases.length > 0 && (
              <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
                <CardHeader className="bg-purple-100/50">
                  <CardTitle className="text-lg text-purple-900">Active Estimate Phases</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    {estimateDetail.phases
                      .sort((a, b) => (a.row_order || 0) - (b.row_order || 0))
                      .map((phase) => (
                        <div
                          key={phase.id}
                          className="flex items-center gap-4 p-3 border rounded-lg bg-white"
                          style={{ borderLeftColor: phase.color, borderLeftWidth: "4px" }}
                        >
                          <div className="flex-1">
                            <div className="font-semibold text-purple-900">{phase.name}</div>
                            <div className="text-sm text-gray-600">
                              {phase.start_date.split("T")[0]} - {phase.end_date.split("T")[0]}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quote Type Selection */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
              <Label htmlFor="quote_type" className="text-blue-900 font-semibold mb-2 block">Quote Type *</Label>
              <Select
                id="quote_type"
                value={quoteType}
                onChange={(e) => {
                  setQuoteType(e.target.value as QuoteType);
                  // Reset type-specific fields
                  if (e.target.value !== "FIXED_BID") {
                    setTargetAmount("");
                    setPaymentTriggers([]);
                  }
                  if (e.target.value !== "TIME_MATERIALS") {
                    setRateBillingUnit("");
                    setInvoiceDetail("");
                    setCapType("NONE");
                    setCapAmount("");
                  }
                }}
                className="border-blue-300 focus:border-blue-500 focus:ring-blue-500 bg-white"
                required
              >
                <option value="">Select quote type</option>
                <option value="FIXED_BID">Fixed Bid</option>
                <option value="TIME_MATERIALS">Time & Materials</option>
              </Select>
            </div>

            {/* Fixed Bid Configuration */}
            {quoteType === "FIXED_BID" && (
              <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
                <CardHeader className="bg-blue-100/50">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg text-blue-900">Fixed Bid Configuration</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDefaultFromEstimate}
                      disabled={!estimateSummary || !opportunity}
                      className="bg-white hover:bg-blue-50 border-blue-300 text-blue-700"
                    >
                      Default from Estimate
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div>
                    <Label htmlFor="target_amount" className="text-blue-700 font-medium">Target Amount ({currency}) *</Label>
                    <div className="flex gap-2 items-end">
                      <Input
                        id="target_amount"
                        type="number"
                        step="0.01"
                        value={targetAmount}
                        onChange={(e) => setTargetAmount(e.target.value)}
                        className="border-blue-300 focus:border-blue-500 focus:ring-blue-500 flex-1"
                        required
                      />
                      <Button
                        type="button"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={distributeTargetAmount}
                        disabled={!targetAmount || paymentTriggers.length === 0}
                      >
                        Distribute Target Amount
                      </Button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-purple-700 font-medium">Payment Triggers *</Label>
                      <Button
                        type="button"
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        size="sm"
                        onClick={addPaymentTrigger}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Trigger
                      </Button>
                    </div>
                    
                    {paymentTriggers.length === 0 && (
                      <div className="bg-blue-100 border border-blue-300 rounded-lg p-3 text-sm text-blue-700">
                        At least one payment trigger is required for Fixed Bid quotes.
                      </div>
                    )}
                    
                    {paymentTriggers.length > 0 && (
                      <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                        <table className="w-full">
                          <thead className="bg-blue-100">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Name</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Type</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Time/Milestone</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900">Amount</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-blue-900 w-12"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {paymentTriggers.map((trigger, index) => (
                              <tr key={index} className="border-t border-blue-100 hover:bg-blue-50">
                                <td className="px-3 py-2">
                                  <Input
                                    value={trigger.name}
                                    onChange={(e) => updatePaymentTrigger(index, { name: e.target.value })}
                                    className="text-sm h-8 border-blue-200"
                                    placeholder="Trigger name"
                                    required
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Select
                                    value={trigger.trigger_type}
                                    onChange={(e) => updatePaymentTrigger(index, {
                                      trigger_type: e.target.value as PaymentTriggerType,
                                      time_type: e.target.value === "TIME" ? "IMMEDIATE" : undefined,
                                      milestone_date: e.target.value === "MILESTONE" ? undefined : undefined,
                                    })}
                                    className="text-sm h-8 border-blue-200"
                                    required
                                  >
                                    <option value="TIME">TIME</option>
                                    <option value="MILESTONE">MILESTONE</option>
                                  </Select>
                                </td>
                                <td className="px-3 py-2">
                                  {trigger.trigger_type === "TIME" ? (
                                    <div className="flex gap-1">
                                      <Select
                                        value={trigger.time_type || "IMMEDIATE"}
                                        onChange={(e) => updatePaymentTrigger(index, {
                                          time_type: e.target.value as TimeType,
                                          num_installments: e.target.value === "MONTHLY" ? 1 : undefined,
                                        })}
                                        className="text-sm h-8 border-blue-200 flex-1"
                                        required
                                      >
                                        <option value="IMMEDIATE">IMMEDIATE</option>
                                        <option value="MONTHLY">MONTHLY</option>
                                      </Select>
                                      {trigger.time_type === "MONTHLY" && (
                                        <Input
                                          type="number"
                                          min="1"
                                          value={trigger.num_installments || ""}
                                          onChange={(e) => updatePaymentTrigger(index, {
                                            num_installments: parseInt(e.target.value) || undefined,
                                          })}
                                          className="text-sm h-8 border-blue-200 w-20"
                                          placeholder="#"
                                          required
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    <Input
                                      type="date"
                                      value={trigger.milestone_date || ""}
                                      onChange={(e) => updatePaymentTrigger(index, {
                                        milestone_date: e.target.value || undefined,
                                      })}
                                      className="text-sm h-8 border-blue-200"
                                      required
                                    />
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={trigger.amount}
                                    onChange={(e) => updatePaymentTrigger(index, { amount: e.target.value })}
                                    className="text-sm h-8 border-blue-200"
                                    placeholder="0.00"
                                    required
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removePaymentTrigger(index)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    
                    {paymentTriggers.length > 0 && (
                      <div className="mt-4 p-4 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg border border-blue-300">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-blue-900">Payment Trigger Total</p>
                            <p className="text-xl font-bold text-blue-900">{formatCurrency(paymentTriggerTotal)}</p>
                          </div>
                        </div>
                        
                        {targetAmount && Math.abs(paymentTriggerTotal - parseFloat(targetAmount)) > 0.01 && (
                          <div className="mt-2 p-2 bg-yellow-100 border border-yellow-400 rounded flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-700" />
                            <p className="text-sm text-yellow-900">
                              Payment trigger total ({formatCurrency(paymentTriggerTotal)}) must equal target amount ({formatCurrency(parseFloat(targetAmount))})
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Time & Materials Configuration */}
            {quoteType === "TIME_MATERIALS" && (
              <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
                <CardHeader className="bg-blue-100/50">
                  <CardTitle className="text-lg text-blue-900">Time & Materials Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="rate_billing_unit" className="text-blue-700 font-medium">Rate Billing Unit *</Label>
                      <Select
                        id="rate_billing_unit"
                        value={rateBillingUnit}
                        onChange={(e) => {
                          setRateBillingUnit(e.target.value as RateBillingUnit);
                          if (e.target.value !== "HOURLY_BLENDED" && e.target.value !== "DAILY_BLENDED") {
                            setBlendedRateAmount("");
                          }
                        }}
                        className="border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                        required
                      >
                        <option value="">Select...</option>
                        <option value="HOURLY_ACTUALS">Hourly @ Actuals</option>
                        <option value="DAILY_ACTUALS">Daily @ Actuals</option>
                        <option value="HOURLY_BLENDED">Hourly @ Blended Rate</option>
                        <option value="DAILY_BLENDED">Daily @ Blended Rate</option>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="invoice_detail" className="text-blue-700 font-medium">Invoice Detail *</Label>
                      <Select
                        id="invoice_detail"
                        value={invoiceDetail}
                        onChange={(e) => setInvoiceDetail(e.target.value as InvoiceDetail)}
                        className="border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                        required
                      >
                        <option value="">Select...</option>
                        <option value="ROLE">Role</option>
                        <option value="EMPLOYEE">Employee</option>
                        <option value="EMPLOYEE_WITH_DESCRIPTIONS">Employee w/ Descriptions</option>
                      </Select>
                    </div>
                  </div>

                  {(rateBillingUnit === "HOURLY_BLENDED" || rateBillingUnit === "DAILY_BLENDED") && (
                    <div>
                      <Label htmlFor="blended_rate_amount" className="text-blue-700 font-medium">Blended Rate Amount ({currency}) *</Label>
                      <Input
                        id="blended_rate_amount"
                        type="number"
                        step="0.01"
                        value={blendedRateAmount}
                        onChange={(e) => setBlendedRateAmount(e.target.value)}
                        className="border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                        required
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cap_type" className="text-blue-700 font-medium">Cap Type *</Label>
                      <Select
                        id="cap_type"
                        value={capType}
                        onChange={(e) => {
                          setCapType(e.target.value as CapType);
                          if (e.target.value === "NONE") {
                            setCapAmount("");
                          }
                        }}
                        className="border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                        required
                      >
                        <option value="NONE">None</option>
                        <option value="CAPPED">Capped (Not to Exceed)</option>
                        <option value="FLOOR">Floor (Minimum Spend)</option>
                      </Select>
                    </div>

                    {capType !== "NONE" && (
                      <div>
                        <Label htmlFor="cap_amount" className="text-blue-700 font-medium">Cap Amount ({currency}) *</Label>
                        <Input
                          id="cap_amount"
                          type="number"
                          step="0.01"
                          value={capAmount}
                          onChange={(e) => setCapAmount(e.target.value)}
                          className="border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                          required
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Variable Compensation */}
            <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50">
              <CardHeader className="bg-emerald-100/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-emerald-900">Variable Compensation (Optional)</CardTitle>
                  <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="sm"
                    onClick={addVariableCompensation}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Variable Compensation
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {variableCompensations.length === 0 && (
                  <div className="bg-emerald-100 border border-emerald-300 rounded-lg p-3 text-sm text-emerald-700">
                    No variable compensations added.
                  </div>
                )}
                
                {variableCompensations.length > 0 && (
                  <div className="border border-emerald-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full">
                      <thead className="bg-emerald-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-emerald-900">Employee</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-emerald-900">Revenue Type</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-emerald-900">Percentage (%)</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-emerald-900 w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {variableCompensations.map((comp, index) => (
                          <tr key={index} className="border-t border-emerald-100 hover:bg-emerald-50">
                            <td className="px-3 py-2">
                              <Select
                                value={comp.employee_id}
                                onChange={(e) => updateVariableCompensation(index, { employee_id: e.target.value })}
                                className="text-sm h-8 border-emerald-200 w-full"
                                required
                              >
                                <option value="">Select employee...</option>
                                {employeesData?.items?.map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.first_name} {emp.last_name}
                                  </option>
                                ))}
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                value={comp.revenue_type || "GROSS_MARGIN"}
                                onChange={(e) => updateVariableCompensation(index, { revenue_type: e.target.value as RevenueType })}
                                className="text-sm h-8 border-emerald-200"
                                required
                              >
                                <option value="GROSS_REVENUE">Gross Revenue</option>
                                <option value="GROSS_MARGIN">Gross Margin</option>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={comp.percentage_amount}
                                onChange={(e) => updateVariableCompensation(index, { percentage_amount: e.target.value })}
                                className="text-sm h-8 border-emerald-200"
                                placeholder="0.00"
                                required
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeVariableCompensation(index)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Comparison View */}
            {quoteType && estimateSummary && (
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
                        {quoteType === "FIXED_BID" ? "Fixed Bid Quote" : "Time & Materials Quote"}
                      </h4>
                      <div className="space-y-2">
                        {quoteType === "FIXED_BID" ? (
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
                            {(rateBillingUnit === "HOURLY_BLENDED" || rateBillingUnit === "DAILY_BLENDED") ? (
                              <div className="mt-2 text-xs text-gray-600">
                                <p>Blended Rate: {formatCurrency(parseFloat(blendedRateAmount || "0"))}</p>
                                <p>Total Hours: {estimateSummary?.totalHours.toFixed(2) || "0"}</p>
                                <p className="mt-1 font-medium">Quote Total = Hours × Blended Rate</p>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 italic">(Same as Estimate)</p>
                            )}
                          </>
                        )}
                        {variableCompensations.length > 0 && (
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

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border rounded px-3 py-2"
                rows={4}
                placeholder="Optional notes about this quote"
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={createQuote.isPending || !opportunityId || !estimateId || !quoteType}
              >
                {createQuote.isPending ? "Creating..." : "Create Quote"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
