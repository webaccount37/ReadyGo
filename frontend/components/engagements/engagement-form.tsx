"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAccounts } from "@/hooks/useAccounts";
import { useEngagements } from "@/hooks/useEngagements";
import { useEmployees } from "@/hooks/useEmployees";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useBillingTerms } from "@/hooks/useBillingTerms";
import { CURRENCIES } from "@/types/currency";
import type { EngagementCreate, EngagementUpdate, Engagement } from "@/types/engagement";

interface EngagementFormProps {
  initialData?: Partial<EngagementCreate> | Engagement;
  onSubmit: (data: EngagementCreate | EngagementUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

interface FormErrors {
  name?: string;
  account_id?: string;
  start_date?: string;
  end_date?: string;
  delivery_center_id?: string;
  billing_term_id?: string;
}

export function EngagementForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: EngagementFormProps) {
  const { data: accountsData } = useAccounts({ limit: 100 });
  const { data: engagementsData } = useEngagements({ limit: 100 });
  const { data: employeesData } = useEmployees({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: billingTermsData, isLoading: billingTermsLoading } = useBillingTerms();

  const [formData, setFormData] = useState<EngagementCreate>({
    name: initialData?.name || "",
    parent_engagement_id: initialData?.parent_engagement_id,
    account_id: initialData?.account_id || "",
    start_date: initialData?.start_date || "",
    end_date: initialData?.end_date || "",
    status: initialData?.status || "discovery",
    billing_term_id: initialData?.billing_term_id || "",
    engagement_type: initialData?.engagement_type || "implementation",
    description: initialData?.description || "",
    utilization: initialData?.utilization,
    margin: initialData?.margin,
    default_currency: initialData?.default_currency || "USD",
    delivery_center_id: initialData?.delivery_center_id || "",
    engagement_owner_id: initialData?.engagement_owner_id,
    invoice_customer: initialData?.invoice_customer !== undefined ? initialData.invoice_customer : true,
    billable_expenses: initialData?.billable_expenses !== undefined ? initialData.billable_expenses : true,
    // New deal/forecast fields
    win_probability: initialData?.win_probability,
    accountability: initialData?.accountability,
    strategic_importance: initialData?.strategic_importance,
    deal_value: initialData?.deal_value,
    project_start_month: initialData?.project_start_month,
    project_start_year: initialData?.project_start_year,
    project_duration_months: initialData?.project_duration_months,
  });
  
  // Calculate probability from status
  const calculateProbability = (status: string): number => {
    const probabilityMap: Record<string, number> = {
      discovery: 10,
      qualified: 25,
      proposal: 50,
      negotiation: 80,
      won: 100,
    };
    return probabilityMap[status] || 0;
  };
  
  const probability = useMemo(() => calculateProbability(formData.status || "discovery"), [formData.status]);

  const [errors, setErrors] = useState<FormErrors>({});

  // Filter employees by selected delivery center
  const filteredEmployees = useMemo(() => {
    if (!formData.delivery_center_id || !employeesData?.items || !deliveryCentersData?.items) {
      return [];
    }
    
    const selectedDeliveryCenter = deliveryCentersData.items.find(
      (dc) => dc.id === formData.delivery_center_id
    );
    
    if (!selectedDeliveryCenter) {
      return [];
    }

    return employeesData.items.filter((emp) => {
      // Employees have delivery_center as a code string, match it to the selected delivery center code
      return emp.delivery_center === selectedDeliveryCenter.code;
    });
  }, [formData.delivery_center_id, employeesData, deliveryCentersData]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name?.trim()) {
      newErrors.name = "Engagement name is required";
    }
    if (!formData.account_id) {
      newErrors.account_id = "Account is required";
    }
    if (!formData.start_date) {
      newErrors.start_date = "Start date is required";
    }
    if (formData.start_date && formData.end_date && formData.end_date < formData.start_date) {
      newErrors.end_date = "End date must be after start date";
    }
    if (!formData.delivery_center_id) {
      newErrors.delivery_center_id = "Delivery center is required";
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
      parent_engagement_id: formData.parent_engagement_id || undefined,
      engagement_owner_id: formData.engagement_owner_id || undefined,
    };
    await onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Engagement Name *</Label>
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
            className={errors.account_id ? "border-red-500" : ""}
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
          <Label htmlFor="parent_engagement_id">Parent Engagement</Label>
          <Select
            id="parent_engagement_id"
            value={formData.parent_engagement_id || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                parent_engagement_id: e.target.value || undefined,
              })
            }
          >
            <option value="">None</option>
            {engagementsData?.items
              .filter((e) => {
                const currentId = 'id' in (initialData || {}) ? (initialData as Engagement).id : undefined;
                return !currentId || e.id !== currentId;
              })
              .map((engagement) => (
                <option key={engagement.id} value={engagement.id}>
                  {engagement.name}
                </option>
              ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            id="status"
            value={formData.status}
            onChange={(e) =>
              setFormData({
                ...formData,
                status: e.target.value as EngagementCreate["status"],
              })
            }
          >
            <option value="discovery">Discovery</option>
            <option value="qualified">Qualified</option>
            <option value="proposal">Proposal</option>
            <option value="negotiation">Negotiation</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="engagement_type">Engagement Type</Label>
          <Select
            id="engagement_type"
            value={formData.engagement_type}
            onChange={(e) =>
              setFormData({
                ...formData,
                engagement_type: e.target.value as EngagementCreate["engagement_type"],
              })
            }
          >
            <option value="implementation">Implementation</option>
            <option value="consulting">Consulting</option>
            <option value="support">Support</option>
          </Select>
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
            className={errors.start_date ? "border-red-500" : ""}
          />
          {errors.start_date && (
            <p className="text-red-500 text-sm mt-1">{errors.start_date}</p>
          )}
        </div>
        <div>
          <Label htmlFor="end_date">End Date</Label>
          <Input
            id="end_date"
            type="date"
            value={formData.end_date || ""}
            onChange={(e) => {
              setFormData({ ...formData, end_date: e.target.value || undefined });
              if (errors.end_date) setErrors({ ...errors, end_date: undefined });
            }}
            className={errors.end_date ? "border-red-500" : ""}
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
          <Label htmlFor="delivery_center_id">Delivery Center *</Label>
          <Select
            id="delivery_center_id"
            value={formData.delivery_center_id}
            onChange={(e) => {
              setFormData({ 
                ...formData, 
                delivery_center_id: e.target.value,
                engagement_owner_id: undefined, // Reset engagement owner when delivery center changes
              });
              if (errors.delivery_center_id) setErrors({ ...errors, delivery_center_id: undefined });
            }}
            required
            className={errors.delivery_center_id ? "border-red-500" : ""}
            disabled={deliveryCentersData === undefined}
          >
            <option value="">
              {deliveryCentersData === undefined ? "Loading..." : "Select delivery center"}
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
          <Label htmlFor="engagement_owner_id">Engagement Owner</Label>
          <Select
            id="engagement_owner_id"
            value={formData.engagement_owner_id || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                engagement_owner_id: e.target.value || undefined,
              })
            }
            disabled={!formData.delivery_center_id}
          >
            <option value="">
              {!formData.delivery_center_id 
                ? "Select delivery center first" 
                : filteredEmployees.length === 0
                ? "No employees available"
                : "Select engagement owner"}
            </option>
            {filteredEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name} {emp.last_name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="default_currency">Default Currency</Label>
          <Select
            id="default_currency"
            value={formData.default_currency}
            onChange={(e) =>
              setFormData({ ...formData, default_currency: e.target.value })
            }
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
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
            disabled={billingTermsLoading}
            className={errors.billing_term_id ? "border-red-500" : ""}
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
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="invoice_customer"
            checked={formData.invoice_customer}
            onChange={(e) =>
              setFormData({ ...formData, invoice_customer: e.target.checked })
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Label htmlFor="invoice_customer" className="cursor-pointer">
            Invoice Customer?
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="billable_expenses"
            checked={formData.billable_expenses}
            onChange={(e) =>
              setFormData({ ...formData, billable_expenses: e.target.checked })
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Label htmlFor="billable_expenses" className="cursor-pointer">
            Billable Expenses?
          </Label>
        </div>
      </div>

      {/* Deal/Forecast Fields Section */}
      <div className="border-t pt-4 space-y-4">
        <h3 className="text-lg font-semibold">Deal & Forecast Information</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div>
            <Label htmlFor="win_probability">Win Probability</Label>
            <Select
              id="win_probability"
              value={formData.win_probability || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  win_probability: e.target.value as EngagementCreate["win_probability"] || undefined,
                })
              }
            >
              <option value="">Select...</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
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
                  accountability: e.target.value as EngagementCreate["accountability"] || undefined,
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
                  strategic_importance: e.target.value as EngagementCreate["strategic_importance"] || undefined,
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
            <Label htmlFor="deal_creation_date">Deal Creation Date</Label>
            <Input
              id="deal_creation_date"
              type="date"
              value={initialData && 'deal_creation_date' in initialData ? (initialData as Engagement).deal_creation_date || "" : ""}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
          <div>
            <Label htmlFor="deal_value">Deal Value ({formData.default_currency})</Label>
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="deal_value_usd">Deal Value (USD)</Label>
            <Input
              id="deal_value_usd"
              type="text"
              value={initialData && 'deal_value_usd' in initialData ? (initialData as Engagement).deal_value_usd || "" : ""}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
          <div>
            <Label htmlFor="close_date">Close Date</Label>
            <Input
              id="close_date"
              type="date"
              value={initialData && 'close_date' in initialData ? (initialData as Engagement).close_date || "" : ""}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="deal_length">Deal Length (days)</Label>
            <Input
              id="deal_length"
              type="text"
              value={initialData && 'deal_length' in initialData ? (initialData as Engagement).deal_length?.toString() || "" : ""}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
          <div>
            <Label htmlFor="forecast_value">Forecast Value ({formData.default_currency})</Label>
            <Input
              id="forecast_value"
              type="text"
              value={initialData && 'forecast_value' in initialData ? (initialData as Engagement).forecast_value || "" : ""}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="forecast_value_usd">Forecast Value (USD)</Label>
            <Input
              id="forecast_value_usd"
              type="text"
              value={initialData && 'forecast_value_usd' in initialData ? (initialData as Engagement).forecast_value_usd || "" : ""}
              readOnly
              className="bg-gray-100 cursor-not-allowed"
            />
          </div>
          <div>
            <Label htmlFor="project_start_month">Project Start Month</Label>
            <Select
              id="project_start_month"
              value={formData.project_start_month || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  project_start_month: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
            >
              <option value="">Select...</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>
                  {new Date(2000, month - 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="project_start_year">Project Start Year</Label>
            <Input
              id="project_start_year"
              type="number"
              min="1000"
              max="9999"
              value={formData.project_start_year || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  project_start_year: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              placeholder="YYYY"
            />
          </div>
          <div>
            <Label htmlFor="project_duration_months">Project Duration (Months)</Label>
            <Select
              id="project_duration_months"
              value={formData.project_duration_months || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  project_duration_months: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
            >
              <option value="">Select...</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading || billingTermsLoading}>
          {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

