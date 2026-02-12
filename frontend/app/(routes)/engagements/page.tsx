"use client";

import { useState, Suspense } from "react";
import { useEngagements } from "@/hooks/useEngagements";
import { useOpportunities } from "@/hooks/useOpportunities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import type { Engagement } from "@/types/engagement";

function EngagementsPageContent() {
  const [skip] = useState(0);
  const [limit] = useState(1000);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error } = useEngagements({
    skip,
    limit,
  });
  const { data: opportunitiesData } = useOpportunities({ limit: 1000 });

  const formatLocalDate = (dateStr: string): string => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: string | undefined, currency: string = "USD") => {
    if (!amount) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(parseFloat(amount));
  };

  const filteredEngagements = data?.items.filter((engagement) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      engagement.name.toLowerCase().includes(query) ||
      engagement.quote_number?.toLowerCase().includes(query) ||
      engagement.quote_display_name?.toLowerCase().includes(query) ||
      engagement.opportunity_name?.toLowerCase().includes(query) ||
      engagement.account_name?.toLowerCase().includes(query)
    );
  }) || [];

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading engagements...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">
              Error loading engagements: {error instanceof Error ? error.message : String(error)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Engagements</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>All Engagements</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search engagements..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEngagements.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? "No engagements match your search." : "No engagements found."}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEngagements.map((engagement) => (
                <div
                  key={engagement.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                    <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <Link
                        href={`/engagements/${engagement.id}`}
                        className="text-lg font-semibold text-blue-600 hover:underline"
                      >
                        Engagement - {engagement.opportunity_name || engagement.opportunity_id}
                      </Link>
                    </div>
                    <div className="mt-2 text-sm text-gray-600 space-y-1">
                      {engagement.account_name && (
                        <div>
                          <span className="font-medium">Account:</span> {engagement.account_name}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Opportunity:</span>{" "}
                        {engagement.opportunity_name || engagement.opportunity_id}
                      </div>
                      {(engagement.quote_display_name || engagement.quote_number) && (
                        <div>
                          <span className="font-medium">Quote:</span> {engagement.quote_display_name || engagement.quote_number}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Created:</span> {formatLocalDate(engagement.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/engagements/${engagement.id}`}>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EngagementsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EngagementsPageContent />
    </Suspense>
  );
}
