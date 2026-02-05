/**
 * Authentication hooks and context
 */

"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authApi, UserInfo, LoginResponse } from "@/lib/api/auth";

interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (redirectUri?: string) => void;
  logout: () => void;
  setAuthData: (data: LoginResponse) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Load auth state from localStorage on mount
  useEffect(() => {
    const loadAuthState = () => {
      const userInfo = authApi.getUserInfo();
      const token = authApi.getAccessToken();
      
      if (userInfo && token) {
        setUser(userInfo);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    };

    loadAuthState();
  }, []);

  // Handle OAuth callback if we're on the callback page
  useEffect(() => {
    if (pathname === "/auth/callback" && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      
      // Check if token is in query params (backend redirected here with token)
      const token = params.get("token");
      if (token) {
        console.log("Token found in callback URL, processing...");
        handleTokenCallback(token, params);
        return;
      }
      
      // Otherwise, check for authorization code (direct callback from Entra ID)
      const code = params.get("code");
      const state = params.get("state");

      if (code) {
        console.log("Authorization code found in callback URL, processing...");
        handleCodeCallback(code, state || undefined);
      } else {
        console.warn("No token or code found in callback URL", window.location.search);
      }
    }
  }, [pathname]); // Run when pathname changes (including initial mount on callback page)
  
  // Also check URL on mount/URL change for callback page (backup check)
  useEffect(() => {
    if (pathname === "/auth/callback" && typeof window !== "undefined") {
      // Force a check by reading the current URL
      const checkUrl = () => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");
        const code = params.get("code");
        
        if (token) {
          console.log("Token detected on URL check, processing...");
          handleTokenCallback(token, params);
        } else if (code) {
          console.log("Code detected on URL check, processing...");
          handleCodeCallback(code, params.get("state") || undefined);
        }
      };
      
      // Check immediately
      checkUrl();
      
      // Also check after a brief delay in case URL is updating
      const timeoutId = setTimeout(checkUrl, 100);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleTokenCallback = (token: string, params: URLSearchParams) => {
    try {
      setIsLoading(true);
      console.log("Processing token callback...");
      
      // Extract user info from query params
      const email = params.get("email");
      if (!email) {
        throw new Error("Email not found in callback parameters");
      }
      
      const userInfo: UserInfo = {
        email: email,
        name: params.get("name") || undefined,
        employee_id: params.get("employee_id") || undefined,
      };
      
      console.log("Storing authentication data...");
      // Store token and user info
      localStorage.setItem("access_token", token);
      localStorage.setItem("user_info", JSON.stringify(userInfo));
      
      setUser(userInfo);
      
      // Redirect to returnUrl from query params, or dashboard
      const returnUrl = params.get("returnUrl") || "/";
      console.log("Redirecting to:", returnUrl);
      router.push(returnUrl);
    } catch (error) {
      console.error("Token callback failed:", error);
      setUser(null);
      router.push("/auth/login?error=auth_failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeCallback = async (code: string, state?: string) => {
    try {
      setIsLoading(true);
      const response = await authApi.handleCallback(code, state);
      
      // Store token and user info
      localStorage.setItem("access_token", response.token.access_token);
      localStorage.setItem("user_info", JSON.stringify(response.user));
      
      setUser(response.user);
      
      // Redirect to returnUrl from query params, or dashboard
      const urlParams = new URLSearchParams(window.location.search);
      const returnUrl = urlParams.get("returnUrl") || (state?.includes(":") ? state.split(":")[1] : "/");
      router.push(returnUrl);
    } catch (error) {
      console.error("Authentication failed:", error);
      setUser(null);
      const errorMessage = error instanceof Error && error.message.includes("Employee record not found")
        ? "employee_not_found"
        : "auth_failed";
      router.push(`/auth/login?error=${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const login = (redirectUri?: string) => {
    const currentPath = pathname !== "/auth/callback" ? pathname : "/";
    const finalRedirectUri = redirectUri || currentPath;
    authApi.login(finalRedirectUri);
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    router.push("/auth/login");
  };

  const setAuthData = (data: LoginResponse) => {
    localStorage.setItem("access_token", data.token.access_token);
    localStorage.setItem("user_info", JSON.stringify(data.user));
    setUser(data.user);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user && !!authApi.getAccessToken(),
    isLoading,
    login,
    logout,
    setAuthData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
