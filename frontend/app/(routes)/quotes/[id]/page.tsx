"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuoteDetail, useUpdateQuoteStatus, useDeactivateQuote } from "@/hooks/useQuotes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useState } from "react";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { UnlockDialog } from "@/components/quotes/unlock-dialog";
import { QuoteStatusUpdate } from "@/types/quote";
import { Lock, FileText, Calendar } from "lucide-react";
import { QuoteReadonlyTable } from "@/components/quotes/quote-readonly-table";

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;
  const { data: quote, isLoading, error, refetch } = useQuoteDetail(quoteId);
  const updateStatus = useUpdateQuoteStatus();
  const deactivateQuote = useDeactivateQuote();
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState<QuoteStatusUpdate>({
    status: quote?.status || "DRAFT",
    sent_date: quote?.sent_date,
  });

  const handleStatusUpdate = async () => {
    if (!quote) return;
    
    try {
      await updateStatus.mutateAsync({
        quoteId: quote.id,
        status: statusUpdate,
      });
      refetch();
    } catch (err) {
      console.error("Failed to update quote status:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeactivate = async () => {
    if (!quote) return;
    
    try {
      await deactivateQuote.mutateAsync(quote.id);
      router.push("/quotes");
    } catch (err) {
      console.error("Failed to deactivate quote:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading quote...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">
              {error ? `Error: ${error.message}` : "Quote not found"}
            </p>
            <Link href="/quotes">
              <Button className="mt-4">Back to Quotes</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {quote.quote_number}
              </CardTitle>
              <div className="flex items-center gap-4 mt-2">
                <QuoteStatusBadge status={quote.status} />
                {quote.is_active && (
                  <span className="flex items-center gap-1 text-green-600 text-sm">
                    <Lock className="h-4 w-4" />
                    Active (Locking Opportunity)
                  </span>
                )}
                <span className="text-sm text-gray-500">
                  Version {quote.version}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {quote.is_active && (
                <Button
                  variant="outline"
                  onClick={() => setIsUnlockDialogOpen(true)}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Unlock
                </Button>
              )}
              <Link href={`/opportunities/${quote.opportunity_id}`}>
                <Button variant="outline">View Opportunity</Button>
              </Link>
              <Link href={`/estimates/${quote.estimate_id}`}>
                <Button variant="outline">View Estimate</Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Opportunity</p>
              <p className="font-medium">{quote.opportunity_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Source Estimate</p>
              <p className="font-medium">{quote.estimate_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Created</p>
              <p className="font-medium">
                {new Date(quote.created_at).toLocaleDateString()}
                {quote.created_by_name && ` by ${quote.created_by_name}`}
              </p>
            </div>
            {quote.sent_date && (
              <div>
                <p className="text-sm text-gray-500">Sent Date</p>
                <p className="font-medium">
                  {new Date(quote.sent_date).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>

          {quote.notes && (
            <div className="mt-4">
              <p className="text-sm text-gray-500">Notes</p>
              <p className="mt-1">{quote.notes}</p>
            </div>
          )}

          {/* Status Update Section */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-3">Update Status</h3>
            <div className="flex items-center gap-4">
              <select
                value={statusUpdate.status}
                onChange={(e) =>
                  setStatusUpdate({
                    ...statusUpdate,
                    status: e.target.value as QuoteStatusUpdate["status"],
                  })
                }
                className="border rounded px-3 py-2"
              >
                <option value="DRAFT">DRAFT</option>
                <option value="SENT">SENT</option>
                <option value="ACCEPTED">ACCEPTED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="INVALID">INVALID</option>
              </select>
              {statusUpdate.status === "SENT" && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <input
                    type="date"
                    value={statusUpdate.sent_date || ""}
                    onChange={(e) =>
                      setStatusUpdate({
                        ...statusUpdate,
                        sent_date: e.target.value || undefined,
                      })
                    }
                    className="border rounded px-3 py-2"
                  />
                </div>
              )}
              <Button
                onClick={handleStatusUpdate}
                disabled={updateStatus.isPending}
              >
                Update Status
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Snapshot Data Display */}
      <Card>
        <CardHeader>
          <CardTitle>Quote Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            This is a read-only snapshot of the estimate data at the time the quote was created.
          </p>
          <QuoteReadonlyTable quote={quote} />
        </CardContent>
      </Card>

      {/* Phases */}
      {quote.phases && quote.phases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Phases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {quote.phases
                .sort((a, b) => a.row_order - b.row_order)
                .map((phase) => (
                  <div
                    key={phase.id}
                    className="flex items-center gap-4 p-3 border rounded-lg"
                    style={{ borderLeftColor: phase.color, borderLeftWidth: "4px" }}
                  >
                    <div className="flex-1">
                      <div className="font-semibold">{phase.name}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(phase.start_date).toLocaleDateString()} - {new Date(phase.end_date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unlock Dialog */}
      <UnlockDialog
        open={isUnlockDialogOpen}
        onOpenChange={setIsUnlockDialogOpen}
        quote={quote}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}

