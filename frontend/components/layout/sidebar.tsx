"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTimesheetIncompleteCount } from "@/hooks/useTimesheets";
import { useTimesheetPendingApprovals } from "@/hooks/useTimesheets";
import { useExpensePendingApprovals } from "@/hooks/useExpenses";
import { useQuotesForApproval } from "@/hooks/useQuotes";
import { LogOut, User } from "lucide-react";
import { navGroups } from "@/components/layout/nav-config";

/** `surface` is the page / bar background behind the logo (dark → light mark, light → dark mark). */
export function ConsultCortexNavLogo({
  className,
  priority,
  surface = "dark",
  altText = "ConsultCortex",
}: {
  className?: string;
  priority?: boolean;
  surface?: "dark" | "light";
  /** Use `""` when a visible or sr-only heading already names the app. */
  altText?: string;
}) {
  const src =
    surface === "light" ? "/ConsultCortexBlack.png" : "/ConsultCortex.png";
  return (
    <Image
      src={src}
      alt={altText}
      width={220}
      height={56}
      className={cn("object-contain object-left", className)}
      priority={priority}
    />
  );
}

interface SidebarContentProps {
  onNavigate?: () => void;
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { data: incompleteData } = useTimesheetIncompleteCount();
  const { data: pendingData } = useTimesheetPendingApprovals({ limit: 1 });
  const { data: expensePendingData } = useExpensePendingApprovals({ limit: 1 });
  const { data: quoteApprovalsData } = useQuotesForApproval(
    { limit: 1 },
    { enabled: isAuthenticated }
  );
  const badgeCounts = {
    "timesheet-incomplete": incompleteData?.count ?? 0,
    "timesheet-pending": pendingData?.total ?? 0,
    "expense-pending": expensePendingData?.total ?? 0,
    "quote-pending": quoteApprovalsData?.total ?? 0,
  };
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    navGroups.forEach((group, index) => {
      if (group.title) {
        initial.add(index);
      }
    });
    return initial;
  });

  const toggleGroup = (index: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const isGroupExpanded = (index: number) => expandedGroups.has(index);

  return (
    <>
      <nav className="space-y-6">
        {navGroups.map((group, groupIndex) => {
          const hasTitle = !!group.title;
          const isExpanded = isGroupExpanded(groupIndex);
          const shouldShowItems = !hasTitle || isExpanded;

          return (
            <div key={groupIndex} className={cn(groupIndex > 0 && "pt-6 border-t border-gray-800")}>
              {hasTitle && (
                <button
                  onClick={() => toggleGroup(groupIndex)}
                  className="w-full px-4 mb-3 flex items-center justify-between text-left hover:text-gray-200 transition-colors"
                >
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {group.title}
                  </h2>
                  <svg
                    className={cn(
                      "w-4 h-4 text-gray-400 transition-transform duration-200",
                      isExpanded ? "rotate-90" : "rotate-0"
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              )}
              <div
                className={cn(
                  "space-y-1 overflow-hidden transition-all duration-200",
                  shouldShowItems ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                )}
              >
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const isComingSoon = item.comingSoon;
                  const Icon = item.icon;
                  
                  if (isComingSoon) {
                    return (
                      <div
                        key={item.href}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2 rounded-md text-sm relative",
                          "text-gray-500 cursor-not-allowed"
                        )}
                      >
                        {Icon && <Icon className="w-5 h-5" />}
                        <span>{item.title}</span>
                        <span className="ml-auto text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                          Soon
                        </span>
                      </div>
                    );
                  }
                  
                  const badgeCount = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2 rounded-md text-sm transition-colors",
                        isActive
                          ? "bg-gray-800 text-white font-medium"
                          : "text-gray-300 hover:bg-gray-800 hover:text-white"
                      )}
                    >
                      {Icon && <Icon className="w-5 h-5" />}
                      <span className="flex-1">{item.title}</span>
                      {badgeCount > 0 && (
                        <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-amber-500 text-gray-900 text-xs font-semibold">
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );
}

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();
  
  return (
    <aside className={`hidden lg:block bg-gray-900 text-white h-screen fixed left-0 top-0 overflow-y-auto border-r border-gray-800 transition-all duration-300 flex flex-col ${collapsed ? "w-16 p-2" : "w-64 p-4"}`}>
      {collapsed ? (
        <div className="flex flex-col items-center">
          <button
            onClick={onToggle}
            className="mb-4 p-2 hover:bg-gray-800 rounded-md transition-colors"
            title="Expand Sidebar"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
          <Link
            href="/"
            className="mb-8 flex justify-center px-1"
            title="ConsultCortex"
          >
            <ConsultCortexNavLogo className="h-8 w-auto max-w-[3rem]" priority />
          </Link>
          <nav className="space-y-4">
            {navGroups.map((group, groupIndex) => (
              <div key={groupIndex} className="flex flex-col items-center">
                {group.items.map((item) => {
                  const isComingSoon = item.comingSoon;
                  if (isComingSoon) return null;
                  
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "p-2 hover:bg-gray-800 rounded-md transition-colors mb-2",
                        isActive && "bg-gray-800"
                      )}
                      title={item.title}
                    >
                      {Icon ? (
                        <Icon className="w-5 h-5" />
                      ) : (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 6h16M4 12h16M4 18h16"
                          />
                        </svg>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center gap-2 mb-8">
            <Link href="/" className="min-w-0 flex-1" title="ConsultCortex">
              <ConsultCortexNavLogo className="h-10 w-auto max-w-[11rem]" priority />
            </Link>
            <button
              onClick={onToggle}
              className="p-1 hover:bg-gray-800 rounded-md transition-colors"
              title="Collapse Sidebar"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarContent />
          </div>
          
          {/* User Info Section */}
          <div className="border-t border-gray-800 pt-4 mt-4">
            {isAuthenticated && user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-4 py-2">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {user.name || user.email}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-md transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            ) : (
              <div className="px-4 py-2">
                <p className="text-xs text-gray-500 mb-2">Not signed in</p>
                <Link
                  href="/auth/login"
                  className="block w-full text-center px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

