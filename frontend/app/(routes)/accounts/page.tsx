"use client";

import { useState, useMemo } from "react";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
} from "@/hooks/useAccounts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { AccountForm } from "@/components/accounts/account-form";
import { AccountContacts } from "@/components/accounts/account-contacts";
import type { AccountCreate, AccountUpdate, Account } from "@/types/account";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";

export default function AccountsPage() {
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [viewingAccount, setViewingAccount] = useState<Account | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, refetch } = useAccounts({ skip, limit });
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  const filteredItems = useMemo(() => {
    if (!data?.items || !searchQuery.trim()) {
      return data?.items || [];
    }
    const query = searchQuery.toLowerCase();
    return data.items.filter((account) => {
      const company = (account.company_name || "").toLowerCase();
      const industry = (account.industry || "").toLowerCase();
      const city = (account.city || "").toLowerCase();
      const region = (account.region || "").toLowerCase();
      const country = (account.country || "").toLowerCase();
      const status = (account.status || "").toLowerCase();
      return (
        company.includes(query) ||
        industry.includes(query) ||
        city.includes(query) ||
        region.includes(query) ||
        country.includes(query) ||
        status.includes(query)
      );
    });
  }, [data, searchQuery]);

  const handleCreate = async (data: AccountCreate | AccountUpdate) => {
    try {
      await createAccount.mutateAsync(data as AccountCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create account:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: AccountCreate | AccountUpdate) => {
    if (!editingAccount) return;
    try {
      await updateAccount.mutateAsync({ id: editingAccount, data: data as AccountUpdate });
      setEditingAccount(null);
      refetch();
    } catch (err) {
      console.error("Failed to update account:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this account?")) {
      try {
        await deleteAccount.mutateAsync(id);
        refetch();
      } catch (err) {
        console.error("Failed to delete account:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const accountToEdit = editingAccount
    ? data?.items.find((a) => a.id === editingAccount)
    : null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Accounts</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage your accounts and their information
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">+ Add Account</Button>
      </div>

      {isLoading && <div className="text-gray-600">Loading accounts...</div>}

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
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle>Accounts ({data?.total ?? 0})</CardTitle>
                <div className="w-full sm:w-64">
                  <Input
                    type="text"
                    placeholder="Search accounts..."
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
                            <th className="text-left p-3 font-semibold">Company Name</th>
                            <th className="text-left p-3 font-semibold">Location</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredItems.map((account) => (
                            <tr
                              key={account.id}
                              className="border-b hover:bg-gray-50 cursor-pointer"
                              onClick={() => setViewingAccount(account)}
                            >
                              <td className="p-3">
                                <div className="font-medium">{highlightText(account.company_name, searchQuery)}</div>
                                {account.industry && (
                                  <div className="text-sm text-gray-500">{highlightText(account.industry, searchQuery)}</div>
                                )}
                              </td>
                              <td className="p-3">
                                <div className="text-sm">
                                  {highlightText(`${account.city}, ${account.region}`, searchQuery)}
                                </div>
                                <div className="text-sm text-gray-500">{highlightText(account.country, searchQuery)}</div>
                              </td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    account.status === "active"
                                      ? "bg-green-100 text-green-800"
                                      : account.status === "prospect"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {highlightText(account.status, searchQuery)}
                                </span>
                              </td>
                            <td className="p-3">
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingAccount(account);
                                  }}
                                >
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingAccount(account.id);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(account.id);
                                  }}
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
                      {filteredItems.map((account) => (
                        <Card
                          key={account.id}
                          className="cursor-pointer"
                          onClick={() => setViewingAccount(account)}
                        >
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Company Name
                                </div>
                                <div className="text-sm font-medium">{highlightText(account.company_name, searchQuery)}</div>
                              </div>
                              <div className="text-sm text-gray-600">
                                {highlightText(`${account.city}, ${account.region}`, searchQuery)}
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <span
                                  className={`px-2 py-1 rounded ${
                                    account.status === "active"
                                      ? "bg-green-100 text-green-800"
                                      : account.status === "prospect"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {highlightText(account.status, searchQuery)}
                                </span>
                                <span className="px-2 py-1 rounded border border-gray-200 text-gray-700 bg-white">
                                  {account.default_currency}
                                </span>
                                {account.industry && (
                                  <span className="px-2 py-1 rounded border border-gray-200 text-gray-700 bg-white">
                                    {highlightText(account.industry, searchQuery)}
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2 pt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingAccount(account);
                                  }}
                                  className="flex-1"
                                >
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingAccount(account.id);
                                  }}
                                  className="flex-1"
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(account.id);
                                  }}
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
                        ? `No accounts found matching "${searchQuery}"` 
                        : "No accounts found."}
                    </p>
                    {!searchQuery.trim() && (
                      <Button
                        className="mt-4"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        Create First Account
                      </Button>
                    )}
                  </div>
                )}
            </CardContent>
          </Card>

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
                Page {Math.floor(skip / limit) + 1} of{" "}
                {Math.ceil(data.total / limit)}
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
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Create New Account</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <AccountForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createAccount.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewingAccount && (
        <Dialog open={!!viewingAccount} onOpenChange={(open) => !open && setViewingAccount(null)}>
          <DialogHeader>
            <DialogTitle>Account Details</DialogTitle>
          </DialogHeader>
          <DialogContent className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Company</p>
              <p className="text-sm text-gray-700">{viewingAccount.company_name}</p>
              {viewingAccount.industry && (
                <p className="text-xs text-gray-500">{viewingAccount.industry}</p>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Location</p>
              <p className="text-sm text-gray-700">
                {viewingAccount.city}, {viewingAccount.region}
              </p>
              <p className="text-xs text-gray-500">{viewingAccount.country}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Status</p>
                <p className="text-sm text-gray-700">{viewingAccount.status}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Default Currency</p>
                <p className="text-sm text-gray-700">{viewingAccount.default_currency}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Billing Terms</p>
              <p className="text-sm text-gray-700">
                {viewingAccount.billing_term?.name || "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Contacts</p>
              <AccountContacts accountId={viewingAccount.id} readOnly />
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setViewingAccount(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      {editingAccount && accountToEdit && (
        <Dialog
          open={!!editingAccount}
          onOpenChange={(open) => !open && setEditingAccount(null)}
        >
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          <DialogContent className="space-y-6">
            <AccountForm
              initialData={accountToEdit}
              onSubmit={handleUpdate}
              onCancel={() => setEditingAccount(null)}
              isLoading={updateAccount.isPending}
            />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800">Contacts</p>
              <AccountContacts accountId={accountToEdit.id as string} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}









