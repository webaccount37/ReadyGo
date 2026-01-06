"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ContactCreate, ContactUpdate } from "@/types/contact";
import type { AccountType } from "@/types/account";
import { useAccounts, useCreateAccount } from "@/hooks/useAccounts";
import { COUNTRIES } from "@/types/countries";

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
  const createAccount = useCreateAccount();

  const [formData, setFormData] = useState<ContactCreate>({
    account_id: initialData?.account_id || "",
    first_name: initialData?.first_name || "",
    last_name: initialData?.last_name || "",
    email: initialData?.email || "",
    phone: initialData?.phone || "",
    job_title: initialData?.job_title || "",
    is_primary: initialData?.is_primary || false,
    is_billing: initialData?.is_billing || false,
  });
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  const [createNewAccount, setCreateNewAccount] = useState(false);
  const [newAccountData, setNewAccountData] = useState<{
    company_name: string;
    type: AccountType;
    country: string;
  }>({
    company_name: "",
    type: "customer",
    country: "",
  });
  const [accountNameError, setAccountNameError] = useState<string>("");

  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.account_id && !createNewAccount) {
      newErrors.account_id = "Account is required";
    }
    if (createNewAccount && !newAccountData.company_name?.trim()) {
      newErrors.account_id = "Company name is required to create a new account";
    }
    if (createNewAccount && !newAccountData.country?.trim()) {
      newErrors.account_id = "Country is required to create a new account";
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
        const { account_id, create_account, ...updateData } = formData;
        await onSubmit(updateData as ContactUpdate);
      } else {
        let accountId = formData.account_id;
        
        // If creating new account inline
        if (createNewAccount && newAccountData.company_name) {
          // Check if account with this company name already exists
          const existingAccount = accountsData?.items.find(
            (acc) => acc.company_name.toLowerCase().trim() === newAccountData.company_name.toLowerCase().trim()
          );
          
          if (existingAccount) {
            setAccountNameError("An account with this company name already exists. Please select it from the dropdown instead.");
            return;
          }
          
          const newAccount = await createAccount.mutateAsync({
            company_name: newAccountData.company_name.trim(),
            type: newAccountData.type as AccountType,
            country: newAccountData.country,
            default_currency: "USD", // Default value
          });
          accountId = newAccount.id;
        }
        
        if (!accountId) {
          setErrors(prev => ({ ...prev, account_id: "Account is required" }));
          return;
        }
        
        await onSubmit({ ...formData, account_id: accountId } as ContactCreate);
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
      {!initialData?.account_id && (
        <div>
          <div>
            <Label htmlFor="account_search">
              Search Account <span className="text-red-500">*</span>
            </Label>
            <Input
              id="account_search"
              type="text"
              placeholder="Type to search for an account..."
              value={accountSearchQuery}
              onChange={(e) => {
                const query = e.target.value;
                setAccountSearchQuery(query);
                setCreateNewAccount(false);
                setAccountNameError("");
                
                // Try to find matching account
                if (query.trim()) {
                  const matchingAccount = accountsData?.items.find(
                    (acc) => acc.company_name.toLowerCase().trim() === query.toLowerCase().trim()
                  );
                  if (matchingAccount) {
                    setFormData({ ...formData, account_id: matchingAccount.id });
                    setAccountSearchQuery(matchingAccount.company_name);
                  } else {
                    setFormData({ ...formData, account_id: "" });
                  }
                } else {
                  setFormData({ ...formData, account_id: "" });
                }
              }}
              className={errors.account_id ? "border-red-500" : ""}
            />
            {accountSearchQuery && !formData.account_id && (
              <div className="mt-2">
                <Select
                  id="account_id"
                  value={formData.account_id}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setFormData({ ...formData, account_id: selectedId });
                    if (selectedId) {
                      const selectedAccount = accountsData?.items.find((acc) => acc.id === selectedId);
                      if (selectedAccount) {
                        setAccountSearchQuery(selectedAccount.company_name);
                      }
                    }
                    if (errors.account_id) setErrors({ ...errors, account_id: undefined });
                  }}
                  disabled={accountsLoading}
                  className={errors.account_id ? "border-red-500" : ""}
                >
                  <option value="">Select from matching accounts</option>
                  {accountsData?.items
                    .filter((account) =>
                      account.company_name.toLowerCase().includes(accountSearchQuery.toLowerCase())
                    )
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.company_name}
                      </option>
                    ))}
                </Select>
              </div>
            )}
            {accountSearchQuery && !formData.account_id && (
              <div className="mt-3 p-3 border border-dashed border-gray-300 rounded bg-gray-50">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="create_new_account"
                    checked={createNewAccount}
                    onChange={(e) => {
                      setCreateNewAccount(e.target.checked);
                      if (e.target.checked) {
                        setNewAccountData({ ...newAccountData, company_name: accountSearchQuery });
                      }
                    }}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="create_new_account" className="cursor-pointer text-sm">
                    No matching account found. Create new account &quot;{accountSearchQuery}&quot;
                  </Label>
                </div>
              </div>
            )}
            {errors.account_id && (
              <p className="text-red-500 text-sm mt-1">{errors.account_id}</p>
            )}
          </div>
          
          {createNewAccount && (
            <div className="space-y-4 p-4 border rounded bg-gray-50">
              <div>
                <Label htmlFor="new_account_company_name">
                  Company Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="new_account_company_name"
                  value={newAccountData.company_name}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewAccountData({ ...newAccountData, company_name: value });
                    setAccountNameError("");
                    setAccountSearchQuery(value);
                    
                    // Check if account exists as user types
                    if (value.trim()) {
                      const existingAccount = accountsData?.items.find(
                        (acc) => acc.company_name.toLowerCase().trim() === value.toLowerCase().trim()
                      );
                      if (existingAccount) {
                        setAccountNameError("An account with this company name already exists. Please select it from the search results above.");
                        setCreateNewAccount(false);
                        setFormData({ ...formData, account_id: existingAccount.id });
                        setAccountSearchQuery(existingAccount.company_name);
                      }
                    }
                  }}
                  required
                  className={accountNameError ? "border-red-500" : ""}
                />
                {accountNameError && (
                  <p className="text-red-500 text-sm mt-1">{accountNameError}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="new_account_type">
                    Type <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    id="new_account_type"
                    value={newAccountData.type}
                    onChange={(e) => setNewAccountData({ ...newAccountData, type: e.target.value as AccountType })}
                    required
                  >
                    <option value="customer">Customer</option>
                    <option value="vendor">Vendor</option>
                    <option value="partner">Partner</option>
                    <option value="network">Network</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="new_account_country">
                    Country <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    id="new_account_country"
                    value={newAccountData.country}
                    onChange={(e) => setNewAccountData({ ...newAccountData, country: e.target.value })}
                    required
                  >
                    <option value="">Select a country</option>
                    {COUNTRIES.map((country) => (
                      <option key={country.value} value={country.label}>
                        {country.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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

      <div className="flex items-center gap-4">
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
        <div className="flex items-center">
          <input
            type="checkbox"
            id="is_billing"
            checked={formData.is_billing}
            onChange={(e) => setFormData({ ...formData, is_billing: e.target.checked })}
            className="h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
          />
          <Label htmlFor="is_billing" className="ml-2 cursor-pointer">
            Billing Contact
          </Label>
        </div>
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

