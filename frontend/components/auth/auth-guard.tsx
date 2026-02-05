"use client";

/**
 * Centralized authentication guard component.
 * This component protects all routes by requiring authentication.
 * Place this at the layout level to enforce authentication across the entire application.
 */

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface AuthGuardProps {
  children: React.ReactNode;
  /**
   * Routes that should be accessible without authentication (e.g., login, callback)
   * These paths are checked with startsWith, so '/auth' matches '/auth/login', '/auth/callback', etc.
   */
  publicRoutes?: string[];
}

const DEFAULT_PUBLIC_ROUTES = ["/auth"];

export function AuthGuard({ children, publicRoutes = DEFAULT_PUBLIC_ROUTES }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Check if current route is public
  const isPublicRoute = publicRoutes.some((route) => pathname?.startsWith(route));

  useEffect(() => {
    // Don't redirect if we're still loading or if it's a public route
    if (isLoading || isPublicRoute) {
      return;
    }

    // If not authenticated and trying to access a protected route, redirect to login
    if (!isAuthenticated) {
      // Store the intended destination so we can redirect back after login
      const returnUrl = pathname !== "/auth/login" ? pathname : "/";
      router.push(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  }, [isAuthenticated, isLoading, isPublicRoute, pathname, router]);

  // Show loading state while checking authentication
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

  // Allow access to public routes without authentication
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Require authentication for all other routes
  if (!isAuthenticated) {
    // Return null while redirecting (the useEffect will handle the redirect)
    return null;
  }

  // User is authenticated, render the protected content
  return <>{children}</>;
}
