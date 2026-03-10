"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCurrencyRates,
  useCreateCurrencyRate,
  useUpdateCurrencyRate,
  useDeleteCurrencyRate,
} from "@/hooks/useCurrencyRates";
import type { CurrencyRateCreate, CurrencyRateUpdate } from "@/types/currency-rate";
import { Plus, Trash2, Save, X, Pencil } from "lucide-react";

export function CurrencyRatesManager() {
  const { data, isLoading, error } = useCurrencyRates({ limit: 1000 });
  const createMutation = useCreateCurrencyRate();
  const updateMutation = useUpdateCurrencyRate();
  const deleteMutation = useDeleteCurrencyRate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCurrencyCode, setNewCurrencyCode] = useState("");
  const [newRate, setNewRate] = useState("");

  const handleEdit = (rate: { id: string; rate_to_usd: number }) => {
    setEditingId(rate.id);
    setEditRate(rate.rate_to_usd);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditRate(null);
  };

  const handleSave = async (id: string) => {
    if (editRate === null || editRate <= 0) {
      alert("Rate must be greater than 0");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id,
        data: { rate_to_usd: editRate },
      });
      setEditingId(null);
      setEditRate(null);
    } catch (error) {
      console.error("Failed to update currency rate:", error);
      alert("Failed to update currency rate. Please try again.");
    }
  };

  const handleDelete = async (id: string, currencyCode: string) => {
    if (currencyCode.toUpperCase() === "USD") {
      alert("Cannot delete USD currency rate (base currency)");
      return;
    }

    if (!confirm(`Are you sure you want to delete the currency rate for ${currencyCode}?`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete currency rate:", error);
      alert("Failed to delete currency rate. Please try again.");
    }
  };

  const handleCreate = async () => {
    if (!newCurrencyCode.trim() || newCurrencyCode.length !== 3) {
      alert("Currency code must be exactly 3 characters (ISO 4217 format)");
      return;
    }

    const rateValue = parseFloat(newRate);
    if (isNaN(rateValue) || rateValue <= 0) {
      alert("Rate must be a positive number");
      return;
    }

    // Check if currency already exists
    const existing = data?.items.find(
      (r) => r.currency_code.toUpperCase() === newCurrencyCode.toUpperCase()
    );
    if (existing) {
      alert(`Currency rate for ${newCurrencyCode.toUpperCase()} already exists`);
      return;
    }

    try {
      await createMutation.mutateAsync({
        currency_code: newCurrencyCode.toUpperCase(),
        rate_to_usd: rateValue,
      });
      setNewCurrencyCode("");
      setNewRate("");
      setShowAddForm(false);
    } catch (error) {
      console.error("Failed to create currency rate:", error);
      alert("Failed to create currency rate. Please try again.");
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading currency rates...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-600">Error loading currency rates: {String(error)}</div>;
  }

  const sortedRates = [...(data?.items || [])].sort((a, b) =>
    a.currency_code.localeCompare(b.currency_code)
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Currency Conversion Rates</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Manage currency conversion rates used throughout the system. Rates are relative to USD (base currency).
        </p>
        
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">How to Set Conversion Rates</h2>
          <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
            The conversion rate represents how many units of the currency equal 1 USD.
          </p>
          <ul className="text-sm text-blue-800 dark:text-blue-300 list-disc list-inside space-y-1">
            <li><strong>Example:</strong> If 1 USD = 50 PHP, enter <strong>50.0</strong> for PHP</li>
            <li><strong>Example:</strong> If 1 USD = 0.85 EUR, enter <strong>0.85</strong> for EUR</li>
            <li><strong>Example:</strong> If 1 USD = 24,000 VND, enter <strong>24000.0</strong> for VND</li>
          </ul>
          <p className="text-sm text-blue-800 dark:text-blue-300 mt-2">
            <strong>Note:</strong> USD is always set to 1.0 and cannot be deleted. Update rates regularly to reflect current exchange rates.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-2 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Currency Rates</h2>
          {!showAddForm && (
            <Button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Currency Rate
            </Button>
          )}
        </div>

        {showAddForm && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label htmlFor="new-currency-code">Currency Code (ISO 4217)</Label>
                <Input
                  id="new-currency-code"
                  value={newCurrencyCode}
                  onChange={(e) => setNewCurrencyCode(e.target.value.toUpperCase())}
                  placeholder="USD"
                  maxLength={3}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="new-rate">Rate to USD</Label>
                <Input
                  id="new-rate"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  placeholder="1.0"
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="flex-1"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewCurrencyCode("");
                    setNewRate("");
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="w-full overflow-hidden">
          <table className="w-full text-xs table-fixed border-collapse">
            <colgroup>
              <col style={{ width: "20%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "42%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="text-left p-1.5 font-semibold whitespace-nowrap text-gray-500 dark:text-gray-400">
                  Currency Code
                </th>
                <th className="text-left p-1.5 font-semibold whitespace-nowrap text-gray-500 dark:text-gray-400">
                  Rate to USD
                </th>
                <th className="text-left p-1.5 font-semibold whitespace-nowrap text-gray-500 dark:text-gray-400">
                  Example
                </th>
                <th className="text-left p-1.5 font-semibold whitespace-nowrap text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {sortedRates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-1.5 text-center text-gray-500 text-xs">
                    No currency rates found. Add one to get started.
                  </td>
                </tr>
              ) : (
                sortedRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="p-1.5 overflow-hidden min-w-0">
                      <span className="font-medium text-xs">{rate.currency_code}</span>
                      {rate.currency_code.toUpperCase() === "USD" && (
                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(Base)</span>
                      )}
                    </td>
                    <td className="p-1.5 overflow-hidden min-w-0">
                      {editingId === rate.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={editRate ?? ""}
                          onChange={(e) => setEditRate(parseFloat(e.target.value))}
                          className="w-24 h-7 text-xs"
                          autoFocus
                        />
                      ) : (
                        <span className="text-xs">{rate.rate_to_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                      )}
                    </td>
                    <td className="p-1.5 overflow-hidden min-w-0 text-xs text-gray-500 dark:text-gray-400 truncate" title={rate.currency_code.toUpperCase() === "USD" ? "1 USD = 1 USD" : `1 USD = ${rate.rate_to_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${rate.currency_code}`}>
                      {rate.currency_code.toUpperCase() === "USD" ? (
                        "1 USD = 1 USD"
                      ) : (
                        `1 USD = ${rate.rate_to_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${rate.currency_code}`
                      )}
                    </td>
                    <td className="p-1 overflow-hidden min-w-0">
                      {editingId === rate.id ? (
                        <div className="flex flex-nowrap gap-0.5 justify-start">
                          <Button
                            size="sm"
                            onClick={() => handleSave(rate.id)}
                            disabled={updateMutation.isPending}
                            className="h-5 w-5 p-0 shrink-0"
                          >
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                            className="h-5 w-5 p-0 shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-nowrap gap-0.5 justify-start">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(rate)}
                            className="h-5 w-5 p-0 shrink-0"
                            title="Edit"
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          {rate.currency_code.toUpperCase() !== "USD" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(rate.id, rate.currency_code)}
                              disabled={deleteMutation.isPending}
                              className="h-5 w-5 p-0 shrink-0 text-red-600 hover:text-red-700"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


