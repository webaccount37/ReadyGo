"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

function LoginPageContent() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");
  const returnUrl = searchParams.get("returnUrl") || "/";

  useEffect(() => {
    // If already authenticated, redirect to intended destination or dashboard
    if (isAuthenticated && !isLoading) {
      router.push(returnUrl);
    }
  }, [isAuthenticated, isLoading, returnUrl, router]);

  const handleLogin = () => {
    // Pass the returnUrl so we can redirect back after login
    login(returnUrl);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">ReadyGo</h1>
          <p className="mt-2 text-gray-600">Consulting Platform</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error === "auth_failed" && "Authentication failed. Please try again."}
            {error === "employee_not_found" && "Your employee account was not found. Please contact your administrator."}
            {error !== "auth_failed" && error !== "employee_not_found" && "An error occurred during login."}
          </div>
        )}

        <div className="space-y-4">
          <Button
            onClick={handleLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg"
            size="lg"
          >
            Sign in with Microsoft
          </Button>
          <p className="text-sm text-gray-500 text-center">
            Use your corporate Entra ID credentials to sign in
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
