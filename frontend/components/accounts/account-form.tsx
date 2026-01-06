"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AccountCreate, AccountUpdate, AccountType } from "@/types/account";
import { COUNTRIES } from "@/types/countries";
import { CURRENCIES } from "@/types/currency";
import { useBillingTerms } from "@/hooks/useBillingTerms";

interface AccountFormProps {
  initialData?: Partial<AccountCreate>;
  onSubmit: (data: AccountCreate | AccountUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

interface FormErrors {
  company_name?: string;
  type?: string;
  country?: string;
}

export function AccountForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: AccountFormProps) {
  const { data: billingTermsData, isLoading: billingTermsLoading } = useBillingTerms({ active_only: true });

  const [formData, setFormData] = useState<AccountCreate>({
    company_name: initialData?.company_name || "",
    type: initialData?.type || "customer",
    industry: initialData?.industry || "",
    street_address: initialData?.street_address || "",
    city: initialData?.city || "",
    region: initialData?.region || "",
    country: initialData?.country || "",
    billing_term_id: initialData?.billing_term_id || "",
    default_currency: initialData?.default_currency || "USD",
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.company_name?.trim()) {
      newErrors.company_name = "Company name is required";
    }
    if (!formData.type) {
      newErrors.type = "Account type is required";
    }
    if (!formData.country?.trim()) {
      newErrors.country = "Country is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(formData);
    } catch (err) {
      // Handle backend validation errors
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("company_name")) {
        setErrors(prev => ({ ...prev, company_name: "Company name is required" }));
      } else if (errorMessage.includes("type")) {
        setErrors(prev => ({ ...prev, type: "Account type is required" }));
      } else if (errorMessage.includes("country")) {
        setErrors(prev => ({ ...prev, country: "Country is required" }));
      }
      throw err;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-800">Basics</p>
        <p className="text-xs text-gray-500">Primary account identity.</p>
      </div>

      <div>
        <Label htmlFor="company_name">Company Name *</Label>
        <Input
          id="company_name"
          value={formData.company_name}
          onChange={(e) => {
            setFormData({ ...formData, company_name: e.target.value });
            if (errors.company_name) setErrors({ ...errors, company_name: undefined });
          }}
          required
          className={errors.company_name ? "border-red-500" : ""}
        />
        {errors.company_name && (
          <p className="text-red-500 text-sm mt-1">{errors.company_name}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="type">Type *</Label>
          <Select
            id="type"
            value={formData.type}
            onChange={(e) => {
              setFormData({ ...formData, type: e.target.value as AccountType });
              if (errors.type) setErrors({ ...errors, type: undefined });
            }}
            required
            className={errors.type ? "border-red-500" : ""}
          >
            <option value="customer">Customer</option>
            <option value="vendor">Vendor</option>
            <option value="partner">Partner</option>
            <option value="network">Network</option>
          </Select>
          {errors.type && (
            <p className="text-red-500 text-sm mt-1">{errors.type}</p>
          )}
        </div>
        <div>
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            value={formData.industry || ""}
            onChange={(e) =>
              setFormData({ ...formData, industry: e.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-1 pt-2">
        <p className="text-sm font-semibold text-gray-800">Address</p>
        <p className="text-xs text-gray-500">Where this account is located.</p>
      </div>

      <div>
        <Label htmlFor="street_address">Street Address</Label>
        <Input
          id="street_address"
          value={formData.street_address || ""}
          onChange={(e) => {
            setFormData({ ...formData, street_address: e.target.value });
          }}
          placeholder="123 Main Street"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={formData.city || ""}
            onChange={(e) => {
              setFormData({ ...formData, city: e.target.value });
            }}
          />
        </div>
        <div>
          <Label htmlFor="region">Region</Label>
          <Input
            id="region"
            value={formData.region || ""}
            onChange={(e) => {
              setFormData({ ...formData, region: e.target.value });
            }}
            placeholder="State/Province"
          />
        </div>
        <div>
          <Label htmlFor="country">Country *</Label>
          <Select
            id="country"
            value={formData.country}
            onChange={(e) => {
              setFormData({ ...formData, country: e.target.value });
              if (errors.country) setErrors({ ...errors, country: undefined });
            }}
            required
            className={errors.country ? "border-red-500" : ""}
          >
            <option value="">Select a country</option>
            {COUNTRIES.map((country) => (
              <option key={country.value} value={country.label}>
                {country.label}
              </option>
            ))}
          </Select>
          {errors.country && (
            <p className="text-red-500 text-sm mt-1">{errors.country}</p>
          )}
        </div>
      </div>

      <div className="space-y-1 pt-2">
        <p className="text-sm font-semibold text-gray-800">Billing Defaults</p>
        <p className="text-xs text-gray-500">Select billing terms and default currency.</p>
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
          <Label htmlFor="billing_term_id">Billing Terms</Label>
          <Select
            id="billing_term_id"
            value={formData.billing_term_id || ""}
            onChange={(e) => {
              setFormData({ ...formData, billing_term_id: e.target.value || undefined });
            }}
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
        <Button type="submit" disabled={isLoading || billingTermsLoading}>
          {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}









