"use client";

import { useState, useMemo } from "react";
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from "@/hooks/useContacts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { ContactForm } from "@/components/contacts/contact-form";
import type { ContactCreate, ContactUpdate, Contact } from "@/types/contact";
import { useAccounts } from "@/hooks/useAccounts";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";

export default function ContactsPage() {
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [viewingContact, setViewingContact] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, refetch } = useContacts({ skip, limit });
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const { data: accountsData } = useAccounts({ skip: 0, limit: 1000 });

  const getAccountName = useMemo(() => {
    return (accountId: string) => {
      return accountsData?.items.find((a) => a.id === accountId)?.company_name || "Unknown Account";
    };
  }, [accountsData]);

  const filteredItems = useMemo(() => {
    if (!data?.items || !searchQuery.trim()) {
      return data?.items || [];
    }
    const query = searchQuery.toLowerCase();
    return data.items.filter((contact) => {
      const firstName = (contact.first_name || "").toLowerCase();
      const lastName = (contact.last_name || "").toLowerCase();
      const email = (contact.email || "").toLowerCase();
      const phone = (contact.phone || "").toLowerCase();
      const jobTitle = (contact.job_title || "").toLowerCase();
      const accountName = (contact.account_name || getAccountName(contact.account_id) || "").toLowerCase();
      return (
        firstName.includes(query) ||
        lastName.includes(query) ||
        email.includes(query) ||
        phone.includes(query) ||
        jobTitle.includes(query) ||
        accountName.includes(query)
      );
    });
  }, [data, searchQuery, getAccountName]);

  const handleCreate = async (data: ContactCreate | ContactUpdate) => {
    try {
      await createContact.mutateAsync(data as ContactCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create contact:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: ContactCreate | ContactUpdate) => {
    if (!editingContact) return;
    try {
      await updateContact.mutateAsync({ id: editingContact, data: data as ContactUpdate });
      setEditingContact(null);
      refetch();
    } catch (err) {
      console.error("Failed to update contact:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    const contact = data?.items.find((c) => c.id === id);
    if (!contact) return;
    
    if (confirm("Are you sure you want to delete this contact?")) {
      try {
        await deleteContact.mutateAsync({ contactId: id, accountId: contact.account_id });
        refetch();
      } catch (err) {
        console.error("Failed to delete contact:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const contactToEdit = editingContact
    ? data?.items.find((c) => c.id === editingContact)
    : null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage your account contacts
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
          + Add Contact
        </Button>
      </div>

      {isLoading && <div className="text-gray-600">Loading contacts...</div>}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">
              Error: {error instanceof Error ? error.message : String(error)}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle>Contacts ({data?.total ?? 0})</CardTitle>
              <div className="w-full sm:w-64">
                <Input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredItems.length > 0 ? (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-semibold">Name</th>
                          <th className="text-left p-3 font-semibold">Account</th>
                          <th className="text-left p-3 font-semibold">Email</th>
                          <th className="text-left p-3 font-semibold">Phone</th>
                          <th className="text-left p-3 font-semibold">Job Title</th>
                          <th className="text-left p-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                      {filteredItems.map((contact) => (
                        <tr 
                          key={contact.id} 
                          className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => setViewingContact(contact)}
                        >
                          <td className="p-3">
                            <div className="font-medium">
                              {highlightText(`${contact.first_name} ${contact.last_name}`, searchQuery)}
                            </div>
                            {contact.is_primary && (
                              <div className="text-xs text-blue-600">Primary</div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="text-sm">{highlightText(contact.account_name || getAccountName(contact.account_id), searchQuery)}</div>
                          </td>
                          <td className="p-3">
                            <div className="text-sm">{contact.email ? highlightText(contact.email, searchQuery) : "—"}</div>
                          </td>
                          <td className="p-3">
                            <div className="text-sm">{contact.phone ? highlightText(contact.phone, searchQuery) : "—"}</div>
                          </td>
                          <td className="p-3">
                            <div className="text-sm">{contact.job_title ? highlightText(contact.job_title, searchQuery) : "—"}</div>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewingContact(contact)}
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingContact(contact.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(contact.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-4">
                    {filteredItems.map((contact) => (
                    <Card 
                      key={contact.id}
                      className="cursor-pointer"
                      onClick={() => setViewingContact(contact)}
                    >
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                              Name
                            </div>
                            <div className="text-sm font-medium">
                              {contact.first_name} {contact.last_name}
                            </div>
                            {contact.is_primary && (
                              <div className="text-xs text-blue-600 mt-1">Primary Contact</div>
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                              Account
                            </div>
                            <div className="text-sm">
                              {contact.account_name || getAccountName(contact.account_id)}
                            </div>
                          </div>
                          {contact.email && (
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Email
                              </div>
                              <div className="text-sm">{contact.email}</div>
                            </div>
                          )}
                          {contact.phone && (
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Phone
                              </div>
                              <div className="text-sm">{contact.phone}</div>
                            </div>
                          )}
                          {contact.job_title && (
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Job Title
                              </div>
                              <div className="text-sm">{contact.job_title}</div>
                            </div>
                          )}
                          <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewingContact(contact)}
                              className="flex-1"
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingContact(contact.id)}
                              className="flex-1"
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(contact.id)}
                              className="flex-1"
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>
                    {searchQuery.trim() 
                      ? `No contacts found matching "${searchQuery}"` 
                      : "No contacts found."}
                  </p>
                  {!searchQuery.trim() && (
                    <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
                      Create First Contact
                    </Button>
                  )}
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {data && data.total > limit && !searchQuery.trim() && (
        <div className="flex justify-center items-center gap-4 mt-4">
          <Button
            variant="outline"
            onClick={() => setSkip(Math.max(0, skip - limit))}
            disabled={skip === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-600">
            Page {Math.floor(skip / limit) + 1} of {Math.ceil(data.total / limit)}
          </span>
          <Button
            variant="outline"
            onClick={() => setSkip(skip + limit)}
            disabled={skip + limit >= data.total}
          >
            Next
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Create New Contact</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <ContactForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createContact.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewingContact && (
        <Dialog open={!!viewingContact} onOpenChange={(open) => !open && setViewingContact(null)}>
          <DialogHeader>
            <DialogTitle>Contact Details</DialogTitle>
          </DialogHeader>
          <DialogContent className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Name</p>
              <p className="text-sm text-gray-700">
                {viewingContact.first_name} {viewingContact.last_name}
              </p>
              {viewingContact.is_primary && (
                <p className="text-xs text-blue-600 mt-1">Primary Contact</p>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Account</p>
              <p className="text-sm text-gray-700">
                {viewingContact.account_name || getAccountName(viewingContact.account_id)}
              </p>
            </div>
            {viewingContact.email && (
              <div>
                <p className="text-sm font-semibold text-gray-800">Email</p>
                <p className="text-sm text-gray-700">{viewingContact.email}</p>
              </div>
            )}
            {viewingContact.phone && (
              <div>
                <p className="text-sm font-semibold text-gray-800">Phone</p>
                <p className="text-sm text-gray-700">{viewingContact.phone}</p>
              </div>
            )}
            {viewingContact.job_title && (
              <div>
                <p className="text-sm font-semibold text-gray-800">Job Title</p>
                <p className="text-sm text-gray-700">{viewingContact.job_title}</p>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setViewingContact(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      {editingContact && contactToEdit && (
        <Dialog
          open={!!editingContact}
          onOpenChange={(open) => !open && setEditingContact(null)}
        >
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <ContactForm
              initialData={contactToEdit}
              onSubmit={handleUpdate}
              onCancel={() => setEditingContact(null)}
              isLoading={updateContact.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

