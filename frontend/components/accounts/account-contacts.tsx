"use client";

import { useState } from "react";
import { useContactsByAccount, useCreateContact, useUpdateContact, useDeleteContact } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContactCreate, ContactUpdate } from "@/types/contact";

interface AccountContactsProps {
  accountId: string;
  readOnly?: boolean;
}

export function AccountContacts({ accountId, readOnly = false }: AccountContactsProps) {
  const { data, isLoading, refetch } = useContactsByAccount(accountId);
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContactCreate>({
    account_id: accountId,
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    job_title: "",
    is_primary: false,
    is_billing: false,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createContact.mutateAsync(formData);
      setIsCreating(false);
      setFormData({
        account_id: accountId,
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        job_title: "",
        is_primary: false,
        is_billing: false,
      });
      refetch();
    } catch (err) {
      console.error("Failed to create contact:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (id: string, data: ContactUpdate) => {
    try {
      await updateContact.mutateAsync({ id, data });
      setEditingId(null);
      refetch();
    } catch (err) {
      console.error("Failed to update contact:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this contact?")) {
      try {
        await deleteContact.mutateAsync({ contactId: id, accountId });
        refetch();
      } catch (err) {
        console.error("Failed to delete contact:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading contacts...</div>;
  }

  return (
    <div className="space-y-4">
      {data?.items && data.items.length > 0 ? (
        <div className="space-y-2">
          {data.items.map((contact) => (
            <div key={contact.id} className="p-3 border rounded">
              {editingId === contact.id ? (
                <ContactEditForm
                  contact={contact}
                  onSave={(data) => handleUpdate(contact.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">
                      {contact.first_name} {contact.last_name}
                      {contact.is_primary && (
                        <span className="ml-2 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded font-medium">
                          Primary
                        </span>
                      )}
                      {contact.is_billing && (
                        <span className="ml-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded font-medium">
                          Billing
                        </span>
                      )}
                    </div>
                    {contact.job_title && (
                      <div className="text-sm text-gray-600">{contact.job_title}</div>
                    )}
                    {contact.email && (
                      <div className="text-sm text-gray-600">{contact.email}</div>
                    )}
                    {contact.phone && (
                      <div className="text-sm text-gray-600">{contact.phone}</div>
                    )}
                  </div>
                  {!readOnly && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(contact.id)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(contact.id)}>
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500">No contacts found.</div>
      )}

      {!readOnly && (
        <div>
          {!isCreating ? (
            <Button size="sm" onClick={() => setIsCreating(true)}>
              + Add Contact
            </Button>
          ) : (
            <form onSubmit={handleCreate} className="space-y-2 p-3 border rounded">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="job_title">Job Title</Label>
                <Input
                  id="job_title"
                  value={formData.job_title}
                  onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_primary"
                  checked={formData.is_primary}
                  onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="is_primary">Primary Contact</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_billing"
                  checked={formData.is_billing}
                  onChange={(e) => setFormData({ ...formData, is_billing: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="is_billing">Billing Contact</Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">Save</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

    </div>
  );
}

function ContactEditForm({
  contact,
  onSave,
  onCancel,
}: {
  contact: { id: string; first_name: string; last_name: string; email?: string; phone?: string; job_title?: string; is_primary: boolean; is_billing: boolean };
  onSave: (data: ContactUpdate) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<ContactUpdate>({
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email,
    phone: contact.phone,
    job_title: contact.job_title,
    is_primary: contact.is_primary,
    is_billing: contact.is_billing,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="edit_first_name">First Name</Label>
          <Input
            id="edit_first_name"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="edit_last_name">Last Name</Label>
          <Input
            id="edit_last_name"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="edit_email">Email</Label>
        <Input
          id="edit_email"
          type="email"
          value={formData.email || ""}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="edit_phone">Phone</Label>
        <Input
          id="edit_phone"
          value={formData.phone || ""}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="edit_job_title">Job Title</Label>
        <Input
          id="edit_job_title"
          value={formData.job_title || ""}
          onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
        />
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="edit_is_primary"
          checked={formData.is_primary}
          onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
          className="h-4 w-4"
        />
        <Label htmlFor="edit_is_primary">Primary Contact</Label>
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="edit_is_billing"
          checked={formData.is_billing}
          onChange={(e) => setFormData({ ...formData, is_billing: e.target.checked })}
          className="h-4 w-4"
        />
        <Label htmlFor="edit_is_billing">Billing Contact</Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">Save</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

