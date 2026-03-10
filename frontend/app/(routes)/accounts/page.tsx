"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useAccount,
} from "@/hooks/useAccounts";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { AccountForm } from "@/components/accounts/account-form";
import { AccountContacts } from "@/components/accounts/account-contacts";
import type { AccountCreate, AccountUpdate, Account } from "@/types/account";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { getAccountTypeColor, getAccountTypeLabel } from "@/lib/utils/account-type";
import { cn } from "@/lib/utils";
import Link from "next/link";

function AccountsPageContent() {
  const searchParams = useSearchParams();
  const accountIdParam = searchParams.get("account_id");
  
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [viewingAccount, setViewingAccount] = useState<Account | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize search query from URL parameter
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParams]);

  const { data: accountData } = useAccount(accountIdParam || "", false, {
    enabled: !!accountIdParam,
  });

  useEffect(() => {
    if (accountIdParam && accountData) {
      setViewingAccount(accountData);
    }
  }, [accountIdParam, accountData]);

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
      const type = (account.type || "").toLowerCase();
      return (
        company.includes(query) ||
        industry.includes(query) ||
        city.includes(query) ||
        region.includes(query) ||
        country.includes(query) ||
        type.includes(query)
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
    const account = data?.items.find((a) => a.id === id);
    if (account?.has_locked_opportunities) return;
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

  const formatCurrency = (amount: number | undefined, currency: string = "USD") => {
    if (amount == null || amount === undefined) return "—";
    if (isNaN(amount)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatLocation = (account: Account) => {
    const parts = [account.city, account.region].filter(Boolean);
    if (parts.length) return parts.join(", ");
    return account.country || "—";
  };

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
            <CardHeader className="px-2">
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
            <CardContent className="px-2">
              {filteredItems.length > 0 ? (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block w-full overflow-hidden">
                      <table className="w-full text-xs table-fixed border-collapse">
                        <colgroup>
                          <col style={{ width: "18%" }} />
                          <col style={{ width: "8%" }} />
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "9%" }} />
                          <col style={{ width: "9%" }} />
                          <col style={{ width: "9%" }} />
                          <col style={{ width: "13%" }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Company Name">Company</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Account Type">Type</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Location">Location</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Contact Count">Contacts</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Opportunity Count">Opps</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Sum of Opportunities Forecast Value (USD)">Forecast $</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Sum of Opportunities Plan Revenue (USD)">Plan $</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Sum of Opportunities Actuals (USD)">Actuals $</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Actions">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredItems.map((account) => (
                            <tr
                              key={account.id}
                              className="border-b hover:bg-gray-50 cursor-pointer"
                              onClick={() => setViewingAccount(account)}
                            >
                              <td className="p-1.5 font-medium text-xs overflow-hidden" title={account.company_name}>
                                <div className="truncate">{highlightText(account.company_name, searchQuery)}</div>
                                {account.industry && (
                                  <div className="text-xs text-gray-500 truncate">{highlightText(account.industry, searchQuery)}</div>
                                )}
                              </td>
                              <td className="p-1.5 overflow-hidden min-w-0">
                                {account.type ? (
                                  <span
                                    className={`px-2 py-0.5 text-xs rounded font-medium ${getAccountTypeColor(account.type).bg} ${getAccountTypeColor(account.type).text}`}
                                    style={{ backgroundColor: getAccountTypeColor(account.type).bgColor }}
                                  >
                                    {getAccountTypeLabel(account.type)}
                                  </span>
                                ) : (
                                  <span className="text-gray-500">—</span>
                                )}
                              </td>
                              <td className="p-1.5 truncate text-xs overflow-hidden" title={formatLocation(account)}>
                                {formatLocation(account)}
                              </td>
                              <td className="p-1.5 text-xs overflow-hidden min-w-0">
                                <Link
                                  href={`/contacts?search=${encodeURIComponent(account.company_name)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {account.contact_count ?? 0}
                                </Link>
                              </td>
                              <td className="p-1.5 text-xs overflow-hidden min-w-0">
                                <Link
                                  href={`/opportunities?account_id=${account.id}&search=${encodeURIComponent(account.company_name)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {account.opportunities_count ?? 0}
                                </Link>
                              </td>
                              <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden text-ellipsis min-w-0" title={account.forecast_sum != null ? formatCurrency(account.forecast_sum, "USD") : "—"}>
                                {account.forecast_sum != null && account.forecast_sum !== undefined && account.forecast_sum !== 0
                                  ? formatCurrency(account.forecast_sum, "USD")
                                  : "—"}
                              </td>
                              <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden text-ellipsis min-w-0" title={account.plan_sum != null ? formatCurrency(account.plan_sum, "USD") : "—"}>
                                {account.plan_sum != null && account.plan_sum !== undefined && account.plan_sum !== 0
                                  ? formatCurrency(account.plan_sum, "USD")
                                  : "—"}
                              </td>
                              <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden text-ellipsis min-w-0" title={account.actuals_sum != null ? formatCurrency(account.actuals_sum, "USD") : "—"}>
                                {account.actuals_sum != null && account.actuals_sum !== undefined && account.actuals_sum !== 0
                                  ? formatCurrency(account.actuals_sum, "USD")
                                  : "—"}
                              </td>
                              <td className="p-1 overflow-hidden min-w-0">
                                <div className="flex flex-nowrap gap-0.5 justify-start" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingAccount(account);
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
                                      setEditingAccount(account.id);
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
                                      handleDelete(account.id);
                                    }}
                                    disabled={account.has_locked_opportunities}
                                    className={cn(
                                      "h-5 w-5 p-0 shrink-0",
                                      account.has_locked_opportunities
                                        ? "text-gray-400 border-gray-200 cursor-not-allowed hover:bg-white hover:text-gray-400 disabled:opacity-100 disabled:pointer-events-auto"
                                        : "text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                                    )}
                                    title={account.has_locked_opportunities ? "Cannot delete account with locked or permanently locked opportunities" : "Delete"}
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
                      {filteredItems.map((account) => (
                        <Card
                          key={account.id}
                          className="cursor-pointer"
                          onClick={() => setViewingAccount(account)}
                        >
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Company</div>
                                <div className="text-sm font-medium">{highlightText(account.company_name, searchQuery)}</div>
                                {account.industry && (
                                  <div className="text-xs text-gray-500">{highlightText(account.industry, searchQuery)}</div>
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Type</div>
                                {account.type ? (
                                  <span
                                    className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${getAccountTypeColor(account.type).bg} ${getAccountTypeColor(account.type).text}`}
                                    style={{ backgroundColor: getAccountTypeColor(account.type).bgColor }}
                                  >
                                    {getAccountTypeLabel(account.type)}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-500">—</span>
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Location</div>
                                <span className="text-sm">{formatLocation(account)}</span>
                              </div>
                              <div className="flex gap-4 text-sm">
                                <Link
                                  href={`/contacts?search=${encodeURIComponent(account.company_name)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  Contacts: {account.contact_count ?? 0}
                                </Link>
                                <Link
                                  href={`/opportunities?account_id=${account.id}&search=${encodeURIComponent(account.company_name)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  Opps: {account.opportunities_count ?? 0}
                                </Link>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-sm">
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Forecast $</div>
                                  <span>{account.forecast_sum != null && account.forecast_sum !== 0 ? formatCurrency(account.forecast_sum, "USD") : "—"}</span>
                                </div>
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Plan $</div>
                                  <span>{account.plan_sum != null && account.plan_sum !== 0 ? formatCurrency(account.plan_sum, "USD") : "—"}</span>
                                </div>
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Actuals $</div>
                                  <span>{account.actuals_sum != null && account.actuals_sum !== 0 ? formatCurrency(account.actuals_sum, "USD") : "—"}</span>
                                </div>
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
                                  title="View"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingAccount(account.id);
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
                                    handleDelete(account.id);
                                  }}
                                  disabled={account.has_locked_opportunities}
                                  className={cn(
                                    "flex-1",
                                    account.has_locked_opportunities
                                      ? "text-gray-400 border-gray-200 cursor-not-allowed hover:bg-white hover:text-gray-400 disabled:opacity-100 disabled:pointer-events-auto"
                                      : "text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                                  )}
                                  title={account.has_locked_opportunities ? "Cannot delete account with locked or permanently locked opportunities" : "Delete"}
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
                <p className="text-sm font-semibold text-gray-800">Type</p>
                {viewingAccount.type ? (
                  <span
                    className={`inline-block px-2 py-1 text-xs rounded font-medium ${getAccountTypeColor(viewingAccount.type).bg} ${getAccountTypeColor(viewingAccount.type).text}`}
                    style={{ backgroundColor: getAccountTypeColor(viewingAccount.type).bgColor }}
                  >
                    {getAccountTypeLabel(viewingAccount.type)}
                  </span>
                ) : (
                  <span className="inline-block px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">—</span>
                )}
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

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="text-gray-600">Loading accounts...</div>}>
      <AccountsPageContent />
    </Suspense>
  );
}




