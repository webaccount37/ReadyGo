"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Lock } from "lucide-react";
import { useAccounts } from "@/hooks/useAccounts";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useEmployees } from "@/hooks/useEmployees";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useBillingTerms } from "@/hooks/useBillingTerms";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { useQuotes } from "@/hooks/useQuotes";
import { CURRENCIES } from "@/types/currency";
import { convertCurrency, setCurrencyRates } from "@/lib/utils/currency";
import type { OpportunityCreate, OpportunityUpdate, Opportunity } from "@/types/opportunity";

interface OpportunityFormProps {
  initialData?: Partial<OpportunityCreate> | Opportunity;
  onSubmit: (data: OpportunityCreate | OpportunityUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

interface FormErrors {
  name?: string;
  account_id?: string;
  start_date?: string;
  end_date?: string;
  delivery_center_id?: string;
  default_currency?: string;
  billing_term_id?: string;
}

export function OpportunityForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: OpportunityFormProps) {
  const { data: accountsData } = useAccounts({ limit: 100 });
  const { data: opportunitiesData } = useOpportunities({ limit: 100 });
  const { data: employeesData } = useEmployees({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: billingTermsData, isLoading: billingTermsLoading } = useBillingTerms();
  const { data: currencyRatesData } = useCurrencyRates({ limit: 1000 });
  
  // Check if opportunity has active quote or is permanently locked
  const opportunityId = 'id' in (initialData || {}) ? (initialData as Opportunity).id : undefined;
  const hasPermanentLock = (initialData as Opportunity)?.is_permanently_locked || false;
  const { data: quotesData } = useQuotes({ 
    opportunity_id: opportunityId || "", 
    limit: 100 
  }, { enabled: !!opportunityId });
  const hasActiveQuote = quotesData?.items?.some(q => q.is_active) || false;
  const isLocked = hasActiveQuote || hasPermanentLock;

  const [formData, setFormData] = useState<OpportunityCreate>({
    name: initialData?.name || "",
    parent_opportunity_id: initialData?.parent_opportunity_id,
    account_id: initialData?.account_id || "",
    start_date: initialData?.start_date || "",
    end_date: initialData?.end_date || "",
    status: initialData?.status || "qualified",
    billing_term_id: initialData?.billing_term_id || "",
    description: initialData?.description || "",
    utilization: initialData?.utilization,
    margin: initialData?.margin,
    default_currency: initialData?.default_currency || "USD",
    delivery_center_id: initialData?.delivery_center_id || "",
    opportunity_owner_id: initialData?.opportunity_owner_id,
    invoice_customer: initialData?.invoice_customer !== undefined ? initialData.invoice_customer : true,
    billable_expenses: initialData?.billable_expenses !== undefined ? initialData.billable_expenses : true,
    // New deal/forecast fields
    accountability: initialData?.accountability,
    strategic_importance: initialData?.strategic_importance,
    deal_value: initialData?.deal_value,
  });

  // State for calculated Deal Value (USD) and Forecast Values
  const [dealValueUsd, setDealValueUsd] = useState<string>(
    initialData && 'deal_value_usd' in initialData ? (initialData as Opportunity).deal_value_usd || "" : ""
  );
  const [forecastValue, setForecastValue] = useState<string>(
    initialData && 'forecast_value' in initialData ? (initialData as Opportunity).forecast_value || "" : ""
  );
  const [forecastValueUsd, setForecastValueUsd] = useState<string>(
    initialData && 'forecast_value_usd' in initialData ? (initialData as Opportunity).forecast_value_usd || "" : ""
  );

  // Update formData when initialData changes (e.g., after an update)
  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        name: initialData.name || prev.name,
        parent_opportunity_id: initialData.parent_opportunity_id ?? prev.parent_opportunity_id,
        account_id: initialData.account_id || prev.account_id,
        start_date: initialData.start_date || prev.start_date,
        end_date: initialData.end_date || prev.end_date,
        status: initialData.status || prev.status,
        billing_term_id: initialData.billing_term_id || prev.billing_term_id,
        description: initialData.description ?? prev.description,
        utilization: initialData.utilization ?? prev.utilization,
        margin: initialData.margin ?? prev.margin,
        default_currency: initialData.default_currency || prev.default_currency || "USD",
        delivery_center_id: initialData.delivery_center_id || prev.delivery_center_id,
        opportunity_owner_id: initialData.opportunity_owner_id ?? prev.opportunity_owner_id,
        invoice_customer: initialData.invoice_customer !== undefined ? initialData.invoice_customer : prev.invoice_customer,
        billable_expenses: initialData.billable_expenses !== undefined ? initialData.billable_expenses : prev.billable_expenses,
        accountability: initialData.accountability ?? prev.accountability,
        strategic_importance: initialData.strategic_importance ?? prev.strategic_importance,
        deal_value: initialData.deal_value ?? prev.deal_value,
      }));

      // Update calculated values if they exist in initialData
      if ('deal_value_usd' in initialData) {
        setDealValueUsd((initialData as Opportunity).deal_value_usd || "");
      }
      if ('forecast_value' in initialData) {
        setForecastValue((initialData as Opportunity).forecast_value || "");
      }
      if ('forecast_value_usd' in initialData) {
        setForecastValueUsd((initialData as Opportunity).forecast_value_usd || "");
      }
    }
  }, [initialData]);

  // Update currency rates cache when rates are fetched
  useEffect(() => {
    if (currencyRatesData?.items) {
      const rates: Record<string, number> = {};
      currencyRatesData.items.forEach((rate) => {
        rates[rate.currency_code.toUpperCase()] = rate.rate_to_usd;
      });
      setCurrencyRates(rates);
    }
  }, [currencyRatesData]);

  // Auto-update billing terms when account changes
  useEffect(() => {
    if (formData.account_id && accountsData?.items) {
      const selectedAccount = accountsData.items.find(a => a.id === formData.account_id);
      if (selectedAccount?.billing_term_id) {
        setFormData(prev => ({ ...prev, billing_term_id: selectedAccount.billing_term_id! }));
      }
    }
  }, [formData.account_id, accountsData]);

  // Clear parent opportunity if it's not linked to the selected account
  useEffect(() => {
    if (formData.account_id && formData.parent_opportunity_id && opportunitiesData?.items) {
      const parentOpportunity = opportunitiesData.items.find(
        opp => opp.id === formData.parent_opportunity_id
      );
      if (parentOpportunity && parentOpportunity.account_id !== formData.account_id) {
        setFormData(prev => ({ ...prev, parent_opportunity_id: undefined }));
      }
    }
  }, [formData.account_id, formData.parent_opportunity_id, opportunitiesData]);

  // Sync formData when initialData changes (e.g., after an update)
  useEffect(() => {
    if (initialData && 'id' in initialData) {
      // Only sync if we have an ID (editing existing opportunity)
      const oppData = initialData as Opportunity;
      setFormData((prev) => ({
        ...prev,
        default_currency: oppData.default_currency || prev.default_currency || "USD",
        // Sync other fields that might have changed
        name: oppData.name || prev.name,
        account_id: oppData.account_id || prev.account_id,
        delivery_center_id: oppData.delivery_center_id || prev.delivery_center_id,
        billing_term_id: oppData.billing_term_id || prev.billing_term_id,
        invoice_customer: oppData.invoice_customer !== undefined ? oppData.invoice_customer : prev.invoice_customer,
        billable_expenses: oppData.billable_expenses !== undefined ? oppData.billable_expenses : prev.billable_expenses,
        deal_value: oppData.deal_value ?? prev.deal_value,
      }));

      // Update calculated values if they exist in initialData
      if ('deal_value_usd' in oppData) {
        setDealValueUsd(oppData.deal_value_usd || "");
      }
      if ('forecast_value' in oppData) {
        setForecastValue(oppData.forecast_value || "");
      }
      if ('forecast_value_usd' in oppData) {
        setForecastValueUsd(oppData.forecast_value_usd || "");
      }
    }
  }, [
    initialData && 'id' in initialData ? (initialData as Opportunity).id : undefined,
    initialData && 'id' in initialData ? (initialData as Opportunity).default_currency : initialData?.default_currency,
    initialData?.name,
    initialData?.account_id,
    initialData?.delivery_center_id,
    initialData?.billing_term_id,
    initialData?.invoice_customer,
    initialData?.billable_expenses,
    initialData?.deal_value,
  ]);

  // Auto-update default currency based on Account or Invoice Center
  // Only runs when account/delivery center changes, NOT when initialData changes
  useEffect(() => {
    // Skip auto-populate if we're editing an existing opportunity (has ID)
    // The currency should come from initialData sync, not auto-populate
    if (initialData && 'id' in initialData) {
      return;
    }

    if (formData.account_id && accountsData?.items) {
      const selectedAccount = accountsData.items.find(a => a.id === formData.account_id);
      // Priority: Account Default Currency > Invoice Center Default Currency
      if (selectedAccount?.default_currency) {
        setFormData(prev => ({ ...prev, default_currency: selectedAccount.default_currency }));
        return; // Don't check Invoice Center if Account has default currency
      }
    }
    // If no Account Default Currency, use Invoice Center Default Currency
    if (formData.delivery_center_id && deliveryCentersData?.items) {
      const selectedDeliveryCenter = deliveryCentersData.items.find(dc => dc.id === formData.delivery_center_id);
      if (selectedDeliveryCenter?.default_currency) {
        setFormData(prev => ({ ...prev, default_currency: selectedDeliveryCenter.default_currency }));
      }
    }
  }, [formData.account_id, formData.delivery_center_id, accountsData, deliveryCentersData, initialData]);

  // Auto-calculate Deal Value (USD) when Deal Value or Default Currency changes
  useEffect(() => {
    if (formData.deal_value && formData.default_currency) {
      const dealValueNum = parseFloat(formData.deal_value);
      if (!isNaN(dealValueNum) && dealValueNum > 0) {
        if (formData.default_currency.toUpperCase() === "USD") {
          setDealValueUsd(dealValueNum.toFixed(2));
        } else {
          const usdValue = convertCurrency(dealValueNum, formData.default_currency, "USD");
          setDealValueUsd(usdValue.toFixed(2));
        }
      } else {
        setDealValueUsd("");
      }
    } else {
      setDealValueUsd("");
    }
  }, [formData.deal_value, formData.default_currency]);

  // Calculate probability from status
  const calculateProbability = (status: string): number => {
    const probabilityMap: Record<string, number> = {
      qualified: 25,
      proposal: 50,
      negotiation: 80,
      won: 100,
    };
    return probabilityMap[status] || 0;
  };
  
  const probability = useMemo(() => calculateProbability(formData.status || "qualified"), [formData.status]);

  // Auto-calculate Forecast Values when Status, Default Currency, Probability, or Deal Value changes
  useEffect(() => {
    const currentProbability = probability;
    const dealValueNum = formData.deal_value ? parseFloat(formData.deal_value) : 0;
    const dealValueUsdNum = dealValueUsd ? parseFloat(dealValueUsd) : 0;

    if (currentProbability > 0 && dealValueNum > 0) {
      const forecast = (dealValueNum * currentProbability / 100).toFixed(2);
      setForecastValue(forecast);
    } else {
      setForecastValue("");
    }

    if (currentProbability > 0 && dealValueUsdNum > 0) {
      const forecastUsd = (dealValueUsdNum * currentProbability / 100).toFixed(2);
      setForecastValueUsd(forecastUsd);
    } else {
      setForecastValueUsd("");
    }
  }, [formData.status, formData.default_currency, probability, formData.deal_value, dealValueUsd]);

  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name?.trim()) {
      newErrors.name = "Opportunity name is required";
    }
    if (!formData.account_id) {
      newErrors.account_id = "Account is required";
    }
    if (!formData.start_date) {
      newErrors.start_date = "Start date is required";
    }
    if (!formData.end_date) {
      newErrors.end_date = "End date is required";
    }
    if (formData.start_date && formData.end_date && formData.end_date < formData.start_date) {
      newErrors.end_date = "End date must be after start date";
    }
    if (!formData.delivery_center_id) {
      newErrors.delivery_center_id = "Invoice center is required";
    }
    if (!formData.default_currency) {
      newErrors.default_currency = "Invoice currency is required";
    }
    if (!formData.billing_term_id) {
      newErrors.billing_term_id = "Billing terms are required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }
    // Convert empty strings to null for optional fields that can be cleared
    // Use null (not undefined) so cleanPayload can preserve it for clearing
    const submitData = {
      ...formData,
      end_date: formData.end_date && formData.end_date.trim() !== "" ? formData.end_date : null,
      description: formData.description && formData.description.trim() !== "" ? formData.description : undefined,
      parent_opportunity_id: formData.parent_opportunity_id || undefined,
      opportunity_owner_id: formData.opportunity_owner_id || undefined,
    };
    await onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {hasActiveQuote && (
        <div className="flex items-center gap-2 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <Lock className="w-5 h-5 text-yellow-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-800">Opportunity Locked</p>
            <p className="text-xs text-yellow-700">This opportunity is locked by an active quote. Some fields cannot be modified until the quote is deactivated.</p>
          </div>
        </div>
      )}
      <div>
        <Label htmlFor="name">Opportunity Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => {
            setFormData({ ...formData, name: e.target.value });
            if (errors.name) setErrors({ ...errors, name: undefined });
          }}
          required
          className={errors.name ? "border-red-500" : ""}
        />
        {errors.name && (
          <p className="text-red-500 text-sm mt-1">{errors.name}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="account_id">Account *</Label>
          <Select
            id="account_id"
            value={formData.account_id}
            onChange={(e) => {
              setFormData({ ...formData, account_id: e.target.value });
              if (errors.account_id) setErrors({ ...errors, account_id: undefined });
            }}
            required
            disabled={isLocked}
            className={errors.account_id ? "border-red-500" : ""}
            title={hasActiveQuote ? "Cannot change account when quote is active" : ""}
          >
            <option value="">Select an account</option>
            {accountsData?.items.map((account) => (
              <option key={account.id} value={account.id}>
                {account.company_name}
              </option>
            ))}
          </Select>
          {errors.account_id && (
            <p className="text-red-500 text-sm mt-1">{errors.account_id}</p>
          )}
        </div>
        <div>
          <Label htmlFor="parent_opportunity_id">Parent Opportunity</Label>
          <Select
            id="parent_opportunity_id"
            value={formData.parent_opportunity_id || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                parent_opportunity_id: e.target.value || undefined,
              })
            }
            disabled={!formData.account_id}
          >
            <option value="">None</option>
            {formData.account_id && opportunitiesData?.items
              .filter((e) => {
                const currentId = 'id' in (initialData || {}) ? (initialData as Opportunity).id : undefined;
                // Filter out current opportunity and only show opportunities linked to the selected account
                return (!currentId || e.id !== currentId) && e.account_id === formData.account_id;
              })
              .map((opportunity) => (
                <option key={opportunity.id} value={opportunity.id}>
                  {opportunity.name}
                </option>
              ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="status">Status</Label>
        <Select
          id="status"
          value={formData.status}
          onChange={(e) =>
            setFormData({
              ...formData,
              status: e.target.value as OpportunityCreate["status"],
            })
          }
          className="[&>option[value='qualified']]:bg-cyan-100 [&>option[value='qualified']]:text-cyan-800 [&>option[value='proposal']]:bg-yellow-100 [&>option[value='proposal']]:text-yellow-800 [&>option[value='negotiation']]:bg-orange-100 [&>option[value='negotiation']]:text-orange-800 [&>option[value='won']]:bg-green-100 [&>option[value='won']]:text-green-800 [&>option[value='lost']]:bg-red-100 [&>option[value='lost']]:text-red-800 [&>option[value='cancelled']]:bg-gray-100 [&>option[value='cancelled']]:text-gray-800"
        >
          <option value="qualified">Qualified</option>
          <option value="proposal">Proposal</option>
          <option value="negotiation">Negotiation</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="delivery_center_id">Invoice Center *</Label>
          <Select
            id="delivery_center_id"
            value={formData.delivery_center_id}
            onChange={(e) => {
              const selectedDc = deliveryCentersData?.items.find(dc => dc.id === e.target.value);
              // Only update currency if Account doesn't have a default currency
              const selectedAccount = accountsData?.items.find(a => a.id === formData.account_id);
              const newCurrency = selectedAccount?.default_currency || selectedDc?.default_currency || formData.default_currency;
              setFormData({ 
                ...formData, 
                delivery_center_id: e.target.value,
                default_currency: newCurrency,
              });
              if (errors.delivery_center_id) setErrors({ ...errors, delivery_center_id: undefined });
            }}
            required
            className={errors.delivery_center_id ? "border-red-500" : ""}
            disabled={deliveryCentersData === undefined || hasActiveQuote}
            title={hasActiveQuote ? "Cannot change invoice center when quote is active" : ""}
          >
            <option value="">
              {deliveryCentersData === undefined ? "Loading..." : "Select invoice center"}
            </option>
            {deliveryCentersData?.items.map((dc) => (
              <option key={dc.id} value={dc.id}>
                {dc.name}
              </option>
            ))}
          </Select>
          {errors.delivery_center_id && (
            <p className="text-red-500 text-sm mt-1">{errors.delivery_center_id}</p>
          )}
        </div>
        <div>
          <Label htmlFor="default_currency">Invoice Currency *</Label>
          <Select
            id="default_currency"
            value={formData.default_currency}
            onChange={(e) => {
              setFormData({ ...formData, default_currency: e.target.value });
              if (errors.default_currency) setErrors({ ...errors, default_currency: undefined });
            }}
            required
            disabled={isLocked}
            className={errors.default_currency ? "border-red-500" : ""}
            title={hasActiveQuote ? "Cannot change invoice currency when quote is active" : ""}
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          {errors.default_currency && (
            <p className="text-red-500 text-sm mt-1">{errors.default_currency}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="start_date">Start Date *</Label>
          <Input
            id="start_date"
            type="date"
            value={formData.start_date || ""}
            onChange={(e) => {
              setFormData({ ...formData, start_date: e.target.value });
              if (errors.start_date) setErrors({ ...errors, start_date: undefined });
            }}
            required
            disabled={isLocked}
            className={errors.start_date ? "border-red-500" : ""}
            title={hasActiveQuote ? "Cannot change start date when quote is active" : ""}
          />
          {errors.start_date && (
            <p className="text-red-500 text-sm mt-1">{errors.start_date}</p>
          )}
        </div>
        <div>
          <Label htmlFor="end_date">End Date *</Label>
          <Input
            id="end_date"
            type="date"
            value={formData.end_date || ""}
            onChange={(e) => {
              setFormData({ ...formData, end_date: e.target.value || "" });
              if (errors.end_date) setErrors({ ...errors, end_date: undefined });
            }}
            required
            disabled={isLocked}
            className={errors.end_date ? "border-red-500" : ""}
            title={hasActiveQuote ? "Cannot change end date when quote is active" : ""}
          />
          {errors.end_date && (
            <p className="text-red-500 text-sm mt-1">{errors.end_date}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          value={formData.description || ""}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="opportunity_owner_id">Opportunity Owner</Label>
          <Select
            id="opportunity_owner_id"
            value={formData.opportunity_owner_id || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                opportunity_owner_id: e.target.value || undefined,
              })
            }
            disabled={isLocked}
            title={hasActiveQuote ? "Cannot change opportunity owner when quote is active" : ""}
          >
            <option value="">Select opportunity owner</option>
            {employeesData?.items?.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name} {emp.last_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="probability">Probability</Label>
          <Input
            id="probability"
            type="text"
            value={`${probability}%`}
            readOnly
            className="bg-gray-100 cursor-not-allowed"
          />
        </div>
      </div>

      {/* Deal Information Section */}
      <div className="border-t pt-4 space-y-4">
        <h3 className="text-lg font-semibold">Deal Information</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="billable_expenses"
              checked={formData.billable_expenses}
              onChange={(e) =>
                setFormData({ ...formData, billable_expenses: e.target.checked })
              }
              disabled={isLocked}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="billable_expenses" className="cursor-pointer">
              Billable Expenses?
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="invoice_customer"
              checked={formData.invoice_customer}
              onChange={(e) =>
                setFormData({ ...formData, invoice_customer: e.target.checked })
              }
              disabled={isLocked}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="invoice_customer" className="cursor-pointer">
              Invoice Customer?
            </Label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="deal_creation_date">Deal Creation Date</Label>
            <Input
              id="deal_creation_date"
              type="date"
              value={initialData && 'deal_creation_date' in initialData ? (initialData as Opportunity).deal_creation_date || "" : ""}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
          <div>
            <Label htmlFor="billing_term_id">Billing Terms *</Label>
            <Select
              id="billing_term_id"
              value={formData.billing_term_id}
              onChange={(e) => {
                setFormData({ ...formData, billing_term_id: e.target.value });
                if (errors.billing_term_id) setErrors({ ...errors, billing_term_id: undefined });
              }}
              required
              disabled={billingTermsLoading || hasActiveQuote}
              className={errors.billing_term_id ? "border-red-500" : ""}
              title={hasActiveQuote ? "Cannot change billing terms when quote is active" : ""}
            >
              <option value="">
                {billingTermsLoading ? "Loading..." : "Select billing terms"}
              </option>
              {billingTermsData?.items.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </Select>
            {errors.billing_term_id && (
              <p className="text-red-500 text-sm mt-1">{errors.billing_term_id}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="accountability">Accountability</Label>
            <Select
              id="accountability"
              value={formData.accountability || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  accountability: e.target.value as OpportunityCreate["accountability"] || undefined,
                })
              }
            >
              <option value="">Select...</option>
              <option value="full_ownership">Full Ownership</option>
              <option value="mgmt_accountable">Mgmt - Accountable</option>
              <option value="mgmt_advisory">Mgmt - Advisory</option>
              <option value="staff_aug_limited">Staff Aug - Limited</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="strategic_importance">Strategic Importance</Label>
            <Select
              id="strategic_importance"
              value={formData.strategic_importance || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  strategic_importance: e.target.value as OpportunityCreate["strategic_importance"] || undefined,
                })
              }
            >
              <option value="">Select...</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="close_date">Close Date</Label>
            <Input
              id="close_date"
              type="date"
              value={initialData && 'close_date' in initialData ? (initialData as Opportunity).close_date || "" : ""}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
          <div>
            <Label htmlFor="deal_length">Deal Length (days)</Label>
            <Input
              id="deal_length"
              type="text"
              value={initialData && 'deal_length' in initialData ? (initialData as Opportunity).deal_length?.toString() || "" : ""}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Forecast Information Section */}
      <div className="border-t pt-4 space-y-4">
        <h3 className="text-lg font-semibold">Forecast Information</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="deal_value">Deal Value</Label>
            <Input
              id="deal_value"
              type="number"
              step="0.01"
              value={formData.deal_value || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  deal_value: e.target.value || undefined,
                })
              }
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="deal_value_usd">Deal Value (USD)</Label>
            <Input
              id="deal_value_usd"
              type="text"
              value={dealValueUsd}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="forecast_value">Forecast Value</Label>
            <Input
              id="forecast_value"
              type="text"
              value={forecastValue}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
          <div>
            <Label htmlFor="forecast_value_usd">Forecast Value (USD)</Label>
            <Input
              id="forecast_value_usd"
              type="text"
              value={forecastValueUsd}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading || billingTermsLoading || isLocked}>
          {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

