"use client";

import { Suspense } from "react";
import { QuoteForm } from "@/components/quotes/quote-form";

function CreateQuotePageContent() {
  return (
    <div className="container mx-auto p-6">
      <QuoteForm />
    </div>
  );
}

export default function CreateQuotePage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-6">Loading...</div>}>
      <CreateQuotePageContent />
    </Suspense>
  );
}

