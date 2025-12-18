"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ContactCreate, ContactUpdate } from "@/types/contact";
import { useAccounts } from "@/hooks/useAccounts";

interface ContactFormProps {
  initialData?: Partial<ContactCreate>;
  onSubmit: (data: ContactCreate | ContactUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

interface FormErrors {
  first_name?: string;
  last_name?: string;
  account_id?: string;
}

export function ContactForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: ContactFormProps) {
  const { data: accountsData, isLoading: accountsLoading } = useAccounts({ skip: 0, limit: 1000 });

  const [formData, setFormData] = useState<ContactCreate>({
    account_id: initialData?.account_id || "",
    first_name: initialData?.first_name || "",
    last_name: initialData?.last_name || "",
    email: initialData?.email || "",
    phone: initialData?.phone || "",
    job_title: initialData?.job_title || "",
    is_primary: initialData?.is_primary || false,
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.account_id) {
      newErrors.account_id = "Account is required";
    }
    if (!formData.first_name?.trim()) {
      newErrors.first_name = "First name is required";
    }
    if (!formData.last_name?.trim()) {
      newErrors.last_name = "Last name is required";
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
      // If editing, exclude account_id from the update payload
      if (initialData?.account_id) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { account_id, ...updateData } = formData;
        await onSubmit(updateData as ContactUpdate);
      } else {
        await onSubmit(formData as ContactCreate);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("account")) {
        setErrors(prev => ({ ...prev, account_id: "Account is required" }));
      } else if (errorMessage.includes("first_name")) {
        setErrors(prev => ({ ...prev, first_name: "First name is required" }));
      } else if (errorMessage.includes("last_name")) {
        setErrors(prev => ({ ...prev, last_name: "Last name is required" }));
      }
      throw err;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="account_id">
          Account <span className="text-red-500">*</span>
        </Label>
        <Select
          id="account_id"
          value={formData.account_id}
          onChange={(e) => {
            setFormData({ ...formData, account_id: e.target.value });
            if (errors.account_id) setErrors({ ...errors, account_id: undefined });
          }}
          disabled={accountsLoading || !!initialData?.account_id}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="first_name">
            First Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="first_name"
            value={formData.first_name}
            onChange={(e) => {
              setFormData({ ...formData, first_name: e.target.value });
              if (errors.first_name) setErrors({ ...errors, first_name: undefined });
            }}
            className={errors.first_name ? "border-red-500" : ""}
          />
          {errors.first_name && (
            <p className="text-red-500 text-sm mt-1">{errors.first_name}</p>
          )}
        </div>
        <div>
          <Label htmlFor="last_name">
            Last Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="last_name"
            value={formData.last_name}
            onChange={(e) => {
              setFormData({ ...formData, last_name: e.target.value });
              if (errors.last_name) setErrors({ ...errors, last_name: undefined });
            }}
            className={errors.last_name ? "border-red-500" : ""}
          />
          {errors.last_name && (
            <p className="text-red-500 text-sm mt-1">{errors.last_name}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="email@example.com"
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+1 (555) 123-4567"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="job_title">Job Title</Label>
        <Input
          id="job_title"
          value={formData.job_title}
          onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
          placeholder="e.g. Project Manager"
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="is_primary"
          checked={formData.is_primary}
          onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
          className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
        />
        <Label htmlFor="is_primary" className="ml-2 cursor-pointer">
          Primary Contact
        </Label>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : initialData ? "Update Contact" : "Create Contact"}
        </Button>
      </div>
    </form>
  );
}

