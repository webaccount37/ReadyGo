"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from "@/hooks/useContacts";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { ContactForm } from "@/components/contacts/contact-form";
import type { ContactCreate, ContactUpdate, Contact } from "@/types/contact";
import { useAccounts } from "@/hooks/useAccounts";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { getAccountTypeColor, getAccountTypeLabel } from "@/lib/utils/account-type";
import type { AccountType } from "@/types/account";
import Link from "next/link";

function ContactsPageContent() {
  const searchParams = useSearchParams();
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [viewingContact, setViewingContact] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize search query from URL parameter
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParams]);

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
          <CardHeader className="px-2">
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
          <CardContent className="px-2">
            {filteredItems.length > 0 ? (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block w-full overflow-hidden">
                    <table className="w-full text-xs table-fixed border-collapse">
                      <colgroup>
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "13%" }} />
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "15%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: "13%" }} />
                        <col style={{ width: "5%" }} />
                        <col style={{ width: "10%" }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Contact Name">Name</th>
                          <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Account">Account</th>
                          <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Account Type">Type</th>
                          <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Email">Email</th>
                          <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Phone">Phone</th>
                          <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Job Title">Job Title</th>
                          <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Account Opportunities">Opps</th>
                          <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                      {filteredItems.map((contact) => (
                        <tr 
                          key={contact.id} 
                          className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => setViewingContact(contact)}
                        >
                          <td className="p-1.5 font-medium text-xs overflow-hidden" title={`${contact.first_name} ${contact.last_name}`}>
                            <div className="flex items-center gap-1.5 min-w-0 flex-nowrap">
                              <span className="truncate">{highlightText(`${contact.first_name} ${contact.last_name}`, searchQuery)}</span>
                              {contact.is_primary && (
                                <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0 rounded shrink-0">Primary</span>
                              )}
                              {contact.is_billing && (
                                <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0 rounded shrink-0">Billing</span>
                              )}
                            </div>
                          </td>
                          <td className="p-1.5 truncate text-xs overflow-hidden" title={contact.account_name || getAccountName(contact.account_id)}>
                            <Link
                              href={`/accounts?search=${encodeURIComponent(contact.account_name || getAccountName(contact.account_id))}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {highlightText(contact.account_name || getAccountName(contact.account_id), searchQuery)}
                            </Link>
                          </td>
                          <td className="p-1.5 overflow-hidden min-w-0">
                            {contact.account_type ? (
                              <span
                                className={`px-2 py-0.5 text-xs rounded font-medium ${getAccountTypeColor(contact.account_type as AccountType).bg} ${getAccountTypeColor(contact.account_type as AccountType).text}`}
                                style={{ backgroundColor: getAccountTypeColor(contact.account_type as AccountType).bgColor }}
                              >
                                {getAccountTypeLabel(contact.account_type as AccountType)}
                              </span>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="p-1.5 truncate text-xs overflow-hidden" title={contact.email || "—"}>
                            {contact.email ? (
                              <a
                                href={`mailto:${contact.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {highlightText(contact.email, searchQuery)}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-1.5 truncate text-xs overflow-hidden" title={contact.phone || "—"}>
                            {contact.phone ? (
                              <a
                                href={`tel:${contact.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {highlightText(contact.phone, searchQuery)}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-1.5 truncate text-xs overflow-hidden" title={contact.job_title || "—"}>
                            {contact.job_title ? highlightText(contact.job_title, searchQuery) : "—"}
                          </td>
                          <td className="p-1.5 text-xs overflow-hidden min-w-0">
                            <Link
                              href={`/opportunities?account_id=${contact.account_id}&search=${encodeURIComponent(contact.account_name || getAccountName(contact.account_id))}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              View
                            </Link>
                          </td>
                          <td className="p-1 overflow-hidden min-w-0">
                            <div className="flex flex-nowrap gap-0.5 justify-start" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingContact(contact);
                                }}
                                className="h-5 w-5 p-0 shrink-0"
                                title="View"
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingContact(contact.id);
                                }}
                                className="h-5 w-5 p-0 shrink-0"
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(contact.id);
                                }}
                                className="h-5 w-5 p-0 shrink-0 text-red-600 hover:text-red-700"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
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
                            <div className="flex gap-1 mt-1">
                              {contact.is_primary && (
                                <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-medium">Primary</span>
                              )}
                              {contact.is_billing && (
                                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-medium">Billing</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                              Account
                            </div>
                            <Link
                              href={`/accounts?search=${encodeURIComponent(contact.account_name || getAccountName(contact.account_id))}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {contact.account_name || getAccountName(contact.account_id)}
                            </Link>
                          </div>
                          {contact.account_type ? (
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Type
                              </div>
                              <span
                                className={`inline-block px-2 py-1 text-xs rounded font-medium ${getAccountTypeColor(contact.account_type as AccountType).bg} ${getAccountTypeColor(contact.account_type as AccountType).text}`}
                                style={{ backgroundColor: getAccountTypeColor(contact.account_type as AccountType).bgColor }}
                              >
                                {getAccountTypeLabel(contact.account_type as AccountType)}
                              </span>
                            </div>
                          ) : null}
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
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Job Title</div>
                              <div className="text-sm">{contact.job_title}</div>
                            </div>
                          )}
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Opportunities</div>
                            <Link
                              href={`/opportunities?account_id=${contact.account_id}&search=${encodeURIComponent(contact.account_name || getAccountName(contact.account_id))}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              View account opportunities
                            </Link>
                          </div>
                          <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingContact(contact);
                              }}
                              className="flex-1"
                              title="View"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingContact(contact.id);
                              }}
                              className="flex-1"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(contact.id);
                              }}
                              className="flex-1 text-red-600 hover:text-red-700"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
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
              <div className="flex gap-1 mt-1">
                {viewingContact.is_primary && (
                  <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-medium">Primary Contact</span>
                )}
                {viewingContact.is_billing && (
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-medium">Billing Contact</span>
                )}
              </div>
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

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="text-gray-600">Loading contacts...</div>}>
      <ContactsPageContent />
    </Suspense>
  );
}

