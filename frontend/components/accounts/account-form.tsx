"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AccountCreate, AccountUpdate } from "@/types/account";
import { COUNTRIES } from "@/types/countries";
import { useBillingTerms } from "@/hooks/useBillingTerms";

interface AccountFormProps {
  initialData?: Partial<AccountCreate>;
  onSubmit: (data: AccountCreate | AccountUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

interface FormErrors {
  company_name?: string;
  street_address?: string;
  city?: string;
  region?: string;
  country?: string;
  billing_term_id?: string;
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
    industry: initialData?.industry || "",
    street_address: initialData?.street_address || "",
    city: initialData?.city || "",
    region: initialData?.region || "",
    country: initialData?.country || "",
    status: initialData?.status || "active",
    billing_term_id: initialData?.billing_term_id || "",
    default_currency: initialData?.default_currency || "USD",
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.company_name?.trim()) {
      newErrors.company_name = "Company name is required";
    }
    if (!formData.street_address?.trim()) {
      newErrors.street_address = "Street address is required";
    }
    if (!formData.city?.trim()) {
      newErrors.city = "City is required";
    }
    if (!formData.region?.trim()) {
      newErrors.region = "Region is required";
    }
    if (!formData.country?.trim()) {
      newErrors.country = "Country is required";
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

    try {
      await onSubmit(formData);
    } catch (err) {
      // Handle backend validation errors
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("billing_term")) {
        setErrors(prev => ({ ...prev, billing_term_id: "Billing terms are required" }));
      } else if (errorMessage.includes("street_address")) {
        setErrors(prev => ({ ...prev, street_address: "Street address is required" }));
      } else if (errorMessage.includes("city")) {
        setErrors(prev => ({ ...prev, city: "City is required" }));
      } else if (errorMessage.includes("region")) {
        setErrors(prev => ({ ...prev, region: "Region is required" }));
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
        <p className="text-xs text-gray-500">Primary account identity and status.</p>
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
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            value={formData.industry || ""}
            onChange={(e) =>
              setFormData({ ...formData, industry: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            id="status"
            value={formData.status}
            onChange={(e) =>
              setFormData({
                ...formData,
                status: e.target.value as AccountCreate["status"],
              })
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="prospect">Prospect</option>
          </Select>
        </div>
      </div>

      <div className="space-y-1 pt-2">
        <p className="text-sm font-semibold text-gray-800">Address</p>
        <p className="text-xs text-gray-500">Where this account is located.</p>
      </div>

      <div>
        <Label htmlFor="street_address">Street Address *</Label>
        <Input
          id="street_address"
          value={formData.street_address}
          onChange={(e) => {
            setFormData({ ...formData, street_address: e.target.value });
            if (errors.street_address) setErrors({ ...errors, street_address: undefined });
          }}
          required
          placeholder="123 Main Street"
          className={errors.street_address ? "border-red-500" : ""}
        />
        {errors.street_address && (
          <p className="text-red-500 text-sm mt-1">{errors.street_address}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => {
              setFormData({ ...formData, city: e.target.value });
              if (errors.city) setErrors({ ...errors, city: undefined });
            }}
            required
            className={errors.city ? "border-red-500" : ""}
          />
          {errors.city && (
            <p className="text-red-500 text-sm mt-1">{errors.city}</p>
          )}
        </div>
        <div>
          <Label htmlFor="region">Region *</Label>
          <Input
            id="region"
            value={formData.region}
            onChange={(e) => {
              setFormData({ ...formData, region: e.target.value });
              if (errors.region) setErrors({ ...errors, region: undefined });
            }}
            required
            placeholder="State/Province"
            className={errors.region ? "border-red-500" : ""}
          />
          {errors.region && (
            <p className="text-red-500 text-sm mt-1">{errors.region}</p>
          )}
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
        <p className="text-sm font-semibold text-gray-800">Billing & Defaults</p>
        <p className="text-xs text-gray-500">Select billing terms and default currency.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="default_currency">Default Currency</Label>
          <Input
            id="default_currency"
            value={formData.default_currency}
            onChange={(e) =>
              setFormData({ ...formData, default_currency: e.target.value })
            }
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







