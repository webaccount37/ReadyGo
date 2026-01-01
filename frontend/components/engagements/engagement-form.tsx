"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useBillingTerms } from "@/hooks/useBillingTerms";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { CURRENCIES } from "@/types/currency";
import type { EngagementCreate, EngagementUpdate } from "@/types/engagement";

interface EngagementFormProps {
  initialData?: Partial<EngagementCreate>;
  onSubmit: (data: EngagementCreate | EngagementUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function EngagementForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: EngagementFormProps) {
  const { data: opportunitiesData } = useOpportunities({ limit: 100 });
  const { data: billingTermsData, isLoading: billingTermsLoading } = useBillingTerms();
  const { data: deliveryCentersData } = useDeliveryCenters();

  const [formData, setFormData] = useState<EngagementCreate>({
    name: initialData?.name || "",
    opportunity_id: initialData?.opportunity_id || "",
    start_date: initialData?.start_date || undefined,
    end_date: initialData?.end_date || undefined,
    budget: initialData?.budget || "",
    status: initialData?.status || "planning",
    billing_term_id: initialData?.billing_term_id || "",
    description: initialData?.description || "",
    default_currency: initialData?.default_currency || "USD",
    delivery_center_id: initialData?.delivery_center_id || "",
  });

  // Auto-populate default_currency, delivery_center_id, and billing_term_id when opportunity is selected
  useEffect(() => {
    if (formData.opportunity_id && opportunitiesData?.items) {
      const selectedOpportunity = opportunitiesData.items.find(
        (e) => e.id === formData.opportunity_id
      );
      if (selectedOpportunity) {
        setFormData((prev) => ({
          ...prev,
          default_currency: selectedOpportunity.default_currency || prev.default_currency || "USD",
          delivery_center_id: selectedOpportunity.delivery_center_id || prev.delivery_center_id || "",
          billing_term_id: selectedOpportunity.billing_term_id || prev.billing_term_id || "",
        }));
      }
    }
  }, [formData.opportunity_id, opportunitiesData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      // Convert empty strings to undefined for optional fields
      start_date: formData.start_date && formData.start_date !== "" ? formData.start_date : undefined,
      end_date: formData.end_date && formData.end_date !== "" ? formData.end_date : undefined,
      billing_term_id: formData.billing_term_id && formData.billing_term_id !== "" ? formData.billing_term_id : undefined,
      delivery_center_id: formData.delivery_center_id && formData.delivery_center_id !== "" ? formData.delivery_center_id : undefined,
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
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="opportunity_id">Opportunity *</Label>
        <Select
          id="opportunity_id"
          value={formData.opportunity_id}
          onChange={(e) =>
            setFormData({ ...formData, opportunity_id: e.target.value })
          }
          required
        >
          <option value="">Select an opportunity</option>
          {opportunitiesData?.items.map((opportunity) => (
            <option key={opportunity.id} value={opportunity.id}>
              {opportunity.name}
            </option>
          ))}
        </Select>
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
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="on-hold">On Hold</option>
          </Select>
        </div>
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="start_date">Start Date</Label>
          <Input
            id="start_date"
            type="date"
            value={formData.start_date || ""}
            onChange={(e) =>
              setFormData({ ...formData, start_date: e.target.value || undefined })
            }
          />
        </div>
        <div>
          <Label htmlFor="end_date">End Date</Label>
          <Input
            id="end_date"
            type="date"
            value={formData.end_date || ""}
            onChange={(e) =>
              setFormData({ ...formData, end_date: e.target.value || undefined })
            }
          />
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="budget">Budget</Label>
          <Input
            id="budget"
            value={formData.budget || ""}
            onChange={(e) =>
              setFormData({ ...formData, budget: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="delivery_center_id">Delivery Center</Label>
          <Select
            id="delivery_center_id"
            value={formData.delivery_center_id || ""}
            onChange={(e) =>
              setFormData({ ...formData, delivery_center_id: e.target.value || undefined })
            }
          >
            <option value="">Select delivery center</option>
            {deliveryCentersData?.items.map((dc) => (
              <option key={dc.id} value={dc.id}>
                {dc.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="billing_term_id">Billing Terms</Label>
          <Select
            id="billing_term_id"
            value={formData.billing_term_id || ""}
            onChange={(e) =>
              setFormData({ ...formData, billing_term_id: e.target.value || undefined })
            }
            disabled={billingTermsLoading}
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
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

