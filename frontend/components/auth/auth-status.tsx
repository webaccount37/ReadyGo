"use client";

import { useAuth } from "@/hooks/useAuth";
import { User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AuthStatus() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>Not signed in</span>
        <a
          href="/auth/login"
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
          <User className="w-5 h-5 text-gray-600" />
        </div>
        <div className="text-sm">
          <p className="font-medium text-gray-900">{user?.name || user?.email}</p>
          <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
      </div>
      <Button
        onClick={logout}
        variant="outline"
        size="sm"
        className="flex items-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </Button>
    </div>
  );
}
