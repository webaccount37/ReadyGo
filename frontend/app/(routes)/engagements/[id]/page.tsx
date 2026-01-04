"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EngagementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const engagementId = params.id as string;

  useEffect(() => {
    // Redirect to main engagements page with view parameter
    if (engagementId) {
      router.replace(`/engagements?view=${engagementId}`);
    } else {
      router.replace("/engagements");
    }
  }, [engagementId, router]);

  // Show loading state while redirecting
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Loading engagement...</p>
      </div>
    </div>
  );
}
