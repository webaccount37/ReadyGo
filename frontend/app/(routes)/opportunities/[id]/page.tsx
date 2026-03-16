"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useOpportunity,
  useUpdateOpportunity,
} from "@/hooks/useOpportunities";
import { useAccounts } from "@/hooks/useAccounts";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useBillingTerms } from "@/hooks/useBillingTerms";
import { useEmployees } from "@/hooks/useEmployees";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useOpportunityActions } from "@/hooks/useOpportunityActions";
import {
  formatCurrency,
  formatDate,
  formatStatus,
  formatEnumValue,
  getForecastDisplayValue,
  getForecastDisplayValueInCurrency,
  getProbabilityFromStatus,
  getDisplayName,
} from "@/lib/opportunity-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { OpportunityRelationships } from "@/components/opportunities/opportunity-relationships";
import type { OpportunityCreate, OpportunityUpdate } from "@/types/opportunity";
import {
  Calculator,
  FileCheck,
  Briefcase,
  Trash2,
  Pencil,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const opportunityId = params.id as string;
  const [isEditMode, setIsEditMode] = useState(false);

  const { data: opportunity, isLoading, error, refetch } = useOpportunity(
    opportunityId,
    true,
    { enabled: !!opportunityId }
  );
  const updateOpportunity = useUpdateOpportunity();
  const {
    getActiveEstimateId,
    getActiveQuoteId,
    hasQuotes,
    hasActiveQuote,
    handleEstimatesClick,
    handleQuotesClick,
    handleDelete,
  } = useOpportunityActions();

  const { data: accountsData } = useAccounts({ limit: 100 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: billingTermsData } = useBillingTerms();
  const { data: employeesData } = useEmployees({ limit: 1000 });
  const { data: allOpportunitiesData } = useOpportunities({ limit: 100 });

  const getAccountName = (id: string | undefined) =>
    getDisplayName(accountsData, id, "company_name" as keyof { id: string; company_name: string });
  const getDeliveryCenterName = (id: string | undefined) =>
    getDisplayName(deliveryCentersData, id, "name" as keyof { id: string; name: string });
  const getBillingTermName = (id: string | undefined) =>
    getDisplayName(billingTermsData, id, "name" as keyof { id: string; name: string });
  const getEmployeeName = (empId: string | undefined): string => {
    if (!empId) return "—";
    const emp = employeesData?.items?.find((e) => e.id === empId);
    return emp ? `${emp.first_name} ${emp.last_name}` : empId;
  };
  const getParentOpportunityName = (parentId: string | undefined): string => {
    if (!parentId) return "None";
    const parent = allOpportunitiesData?.items?.find((o) => o.id === parentId);
    return parent?.name || parentId;
  };

  const handleUpdate = async (data: OpportunityCreate | OpportunityUpdate) => {
    if (!opportunityId) return;
    try {
      await updateOpportunity.mutateAsync({
        id: opportunityId,
        data: data as OpportunityUpdate,
      });
      setIsEditMode(false);
      refetch();
    } catch (err) {
      console.error("Failed to update opportunity:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteSuccess = () => {
    router.push("/opportunities");
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading opportunity...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">
              {error
                ? `Error loading opportunity: ${error instanceof Error ? error.message : String(error)}`
                : "Opportunity not found"}
            </p>
            <Link href="/opportunities">
              <Button className="mt-4">Back to Opportunities</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLocked =
    opportunity.is_permanently_locked || hasActiveQuote(opportunity.id);

  return (
    <div className="w-full max-w-full overflow-x-hidden min-w-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <Link
            href="/opportunities"
            className="text-blue-600 hover:underline mb-2 inline-block"
          >
            ← Back to Opportunities
          </Link>
          <h1 className="text-3xl font-bold">{opportunity.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {getAccountName(opportunity.account_id) !== "—" && (
              <>Account: {getAccountName(opportunity.account_id)} • </>
            )}
            Status: {formatStatus(opportunity.status)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEditMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditMode(false)}
            >
              Cancel Edit
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditMode(true)}
              title="Edit"
            >
              <Pencil className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => handleEstimatesClick(opportunity.id, e)}
            className="text-blue-600 hover:text-blue-700"
            title={
              getActiveEstimateId(opportunity.id)
                ? "View Active Estimate"
                : "View Estimates"
            }
          >
            <Calculator className="w-4 h-4 mr-1" />
            Estimates
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => handleQuotesClick(opportunity.id, e)}
            className="text-green-600 hover:text-green-700"
            title={
              getActiveQuoteId(opportunity.id)
                ? "View Active Quote"
                : hasQuotes(opportunity.id)
                ? "View Quotes"
                : "Create Quote"
            }
          >
            <FileCheck className="w-4 h-4 mr-1" />
            Quotes
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (opportunity.engagement_id) {
                router.push(`/engagements?opportunity_id=${opportunity.id}`);
              }
            }}
            className={cn(
              opportunity.engagement_id
                ? "text-purple-600 hover:text-purple-700"
                : "text-gray-400 cursor-not-allowed"
            )}
            title={
              opportunity.engagement_id
                ? "View Engagement"
                : "No Engagement"
            }
            disabled={!opportunity.engagement_id}
          >
            <Briefcase className="w-4 h-4 mr-1" />
            Engagement
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              handleDelete(opportunity.id, opportunity, handleDeleteSuccess)
            }
            disabled={opportunity.is_permanently_locked || opportunity.is_locked}
            className={cn(
              opportunity.is_permanently_locked || opportunity.is_locked
                ? "text-gray-400 cursor-not-allowed"
                : "text-red-600 hover:text-red-700"
            )}
            title={
              opportunity.is_permanently_locked || opportunity.is_locked
                ? "Cannot delete locked or permanently locked opportunity"
                : "Delete"
            }
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {isEditMode ? (
        <div className="space-y-6">
          <Card className="bg-gradient-to-r from-slate-50 to-gray-50 border-gray-200">
            <CardContent className="pt-6">
              <OpportunityForm
                initialData={opportunity}
                onSubmit={handleUpdate}
                onCancel={() => setIsEditMode(false)}
                isLoading={updateOpportunity.isPending}
              />
            </CardContent>
          </Card>
          {opportunity && (
            <Card>
              <CardHeader>
                <CardTitle>Relationships</CardTitle>
              </CardHeader>
              <CardContent>
                <OpportunityRelationships
                  opportunity={opportunity}
                  onUpdate={async () => refetch()}
                  readOnly={opportunity.is_permanently_locked ?? false}
                />
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {isLocked && (
            <div
              className={cn(
                "flex items-center gap-2 px-4 py-3 rounded-lg border",
                opportunity.is_permanently_locked
                  ? "bg-violet-50 text-violet-800 border-violet-200"
                  : "bg-yellow-50 text-yellow-800 border-yellow-200"
              )}
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">
                {opportunity.is_permanently_locked
                  ? "Permanently Locked by Active Timesheets"
                  : "Locked by Active Quote"}
              </span>
            </div>
          )}

          <Card className="bg-gradient-to-r from-slate-50 to-gray-50 border-gray-200">
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-gray-800">Opportunity Name</p>
                  <p className="text-gray-700">{opportunity.name}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Account</p>
                  <Link
                    href={`/accounts?search=${encodeURIComponent(getAccountName(opportunity.account_id))}`}
                    className="text-blue-600 hover:underline"
                  >
                    {getAccountName(opportunity.account_id)}
                  </Link>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Parent Opportunity</p>
                  {opportunity.parent_opportunity_id ? (
                    <Link
                      href={`/opportunities/${opportunity.parent_opportunity_id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {getParentOpportunityName(opportunity.parent_opportunity_id)}
                    </Link>
                  ) : (
                    <p className="text-gray-700">None</p>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Status</p>
                  <span
                    className={cn(
                      "px-2 py-1 text-xs rounded",
                      opportunity.status === "won" && "bg-green-100 text-green-800",
                      opportunity.status === "lost" && "bg-red-100 text-red-800",
                      opportunity.status === "cancelled" && "bg-gray-100 text-gray-800",
                      opportunity.status === "negotiation" && "bg-orange-100 text-orange-800",
                      opportunity.status === "proposal" && "bg-yellow-100 text-yellow-800",
                      opportunity.status === "qualified" && "bg-cyan-100 text-cyan-800",
                      (!opportunity.status || (opportunity.status as string) === "discovery") && "bg-blue-100 text-blue-800"
                    )}
                  >
                    {formatStatus(opportunity.status)}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Start Date</p>
                  <p className="text-gray-700">{formatDate(opportunity.start_date)}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">End Date</p>
                  <p className="text-gray-700">{formatDate(opportunity.end_date)}</p>
                </div>
                {opportunity.description && (
                  <div className="col-span-2">
                    <p className="font-semibold text-gray-800">Description</p>
                    <p className="text-gray-700 whitespace-pre-wrap">
                      {opportunity.description}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Financial & Billing Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-gray-800">Invoice Center</p>
                  <Link
                    href={`/delivery-centers?search=${encodeURIComponent(getDeliveryCenterName(opportunity.delivery_center_id))}`}
                    className="text-blue-600 hover:underline"
                  >
                    {getDeliveryCenterName(opportunity.delivery_center_id)}
                  </Link>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Opportunity Owner</p>
                  <p className="text-gray-700">
                    {getEmployeeName(opportunity.opportunity_owner_id)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Default Currency</p>
                  <p className="text-gray-700">
                    {opportunity.default_currency || "—"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Billing Terms</p>
                  <p className="text-gray-700">
                    {getBillingTermName(opportunity.billing_term_id)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Invoice Customer?</p>
                  <p className="text-gray-700">
                    {opportunity.invoice_customer ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Billable Expenses?</p>
                  <p className="text-gray-700">
                    {opportunity.billable_expenses ? "Yes" : "No"}
                  </p>
                </div>
                {opportunity.utilization != null && (
                  <div>
                    <p className="font-semibold text-gray-800">Utilization</p>
                    <p className="text-gray-700">{opportunity.utilization}%</p>
                  </div>
                )}
                {opportunity.margin != null && (
                  <div>
                    <p className="font-semibold text-gray-800">Margin</p>
                    <p className="text-gray-700">{opportunity.margin}%</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deal & Forecast Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-gray-800">Probability</p>
                  <p className="text-gray-700">
                    {opportunity.status != null
                      ? `${getProbabilityFromStatus(opportunity.status)}%`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Accountability</p>
                  <p className="text-gray-700">
                    {formatEnumValue(opportunity.accountability)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Strategic Importance</p>
                  <p className="text-gray-700">
                    {formatEnumValue(opportunity.strategic_importance)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Deal Creation Date</p>
                  <p className="text-gray-700">
                    {formatDate(opportunity.deal_creation_date)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Close Date</p>
                  <p className="text-gray-700">
                    {formatDate(opportunity.close_date)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Deal Value</p>
                  <p className="text-gray-700">
                    {opportunity.deal_value
                      ? formatCurrency(
                          opportunity.deal_value,
                          opportunity.default_currency
                        )
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Deal Value (USD)</p>
                  <p className="text-gray-700">
                    {opportunity.deal_value_usd
                      ? formatCurrency(opportunity.deal_value_usd, "USD")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Forecast Value</p>
                  <p className="text-gray-700">
                    {opportunity.forecast_value != null &&
                    opportunity.forecast_value !== undefined &&
                    String(opportunity.forecast_value) !== ""
                      ? formatCurrency(
                          opportunity.forecast_value,
                          opportunity.default_currency || "USD"
                        )
                      : getForecastDisplayValueInCurrency(opportunity) != null
                      ? formatCurrency(
                          getForecastDisplayValueInCurrency(opportunity),
                          opportunity.default_currency || "USD"
                        )
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Forecast Value (USD)</p>
                  <p className="text-gray-700">
                    {opportunity.forecast_value_usd != null &&
                    opportunity.forecast_value_usd !== undefined &&
                    String(opportunity.forecast_value_usd) !== ""
                      ? formatCurrency(opportunity.forecast_value_usd, "USD")
                      : getForecastDisplayValue(opportunity) != null
                      ? formatCurrency(
                          getForecastDisplayValue(opportunity),
                          "USD"
                        )
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Deal Length (days)</p>
                  <p className="text-gray-700">
                    {opportunity.deal_length != null
                      ? opportunity.deal_length
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Plan Revenue (USD)</p>
                  <p className="text-gray-700">
                    {opportunity.plan_amount != null &&
                    opportunity.plan_amount !== undefined &&
                    String(opportunity.plan_amount) !== ""
                      ? formatCurrency(opportunity.plan_amount, "USD")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">
                    Actuals from Approved Timesheets (USD)
                  </p>
                  <p className="text-gray-700">
                    {opportunity.actuals_amount != null &&
                    opportunity.actuals_amount !== undefined &&
                    String(opportunity.actuals_amount) !== "0"
                      ? formatCurrency(opportunity.actuals_amount, "USD")
                      : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {opportunity && (
            <Card>
              <CardHeader>
                <CardTitle>Relationships</CardTitle>
              </CardHeader>
              <CardContent>
                <OpportunityRelationships
                  opportunity={opportunity}
                  onUpdate={async () => refetch()}
                  readOnly={true}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
