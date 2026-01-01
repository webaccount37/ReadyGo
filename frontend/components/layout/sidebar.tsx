"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  Building2,
  ContactRound,
  Package,
  Calculator,
  FileCheck,
  TrendingUp,
  Users,
  Shield,
  Calendar,
  Network,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [{ title: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    title: "Client Management",
    items: [
      { title: "Opportunities", href: "/opportunities", icon: Briefcase },
      { title: "Accounts", href: "/accounts", icon: Building2 },
      { title: "Contacts", href: "/contacts", icon: ContactRound },
    ],
  },
  {
    title: "Project Delivery",
    items: [
      { title: "Releases", href: "/releases", icon: Package },
      { title: "Estimates", href: "/estimates", icon: Calculator },
      { title: "Quoting", href: "#", comingSoon: true, icon: FileCheck },
      { title: "Forecast", href: "#", comingSoon: true, icon: TrendingUp },
    ],
  },
  {
    title: "Resources",
    items: [
      { title: "Employees", href: "/employees", icon: Users },
      { title: "Roles", href: "/roles", icon: Shield },
      { title: "Calendars", href: "/calendars", icon: Calendar },
    ],
  },
  {
    items: [{ title: "Relationships", href: "/test-relationships", icon: Network }],
  },
];

interface SidebarContentProps {
  onNavigate?: () => void;
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
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
                  
                  if (isComingSoon) {
                    return (
                      <div
                        key={item.href}
                        className={cn(
                          "block px-4 py-2 rounded-md text-sm relative",
                          "text-gray-500 cursor-not-allowed"
                        )}
                      >
                        {item.title}
                        <span className="ml-2 text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                          Soon
                        </span>
                      </div>
                    );
                  }
                  
                  const Icon = item.icon;
                  
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
                      <span>{item.title}</span>
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
  
  return (
    <aside className={`hidden lg:block bg-gray-900 text-white h-screen fixed left-0 top-0 overflow-y-auto border-r border-gray-800 transition-all duration-300 ${collapsed ? "w-16 p-2" : "w-64 p-4"}`}>
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
          <div className="text-xs font-bold mb-8">RG</div>
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
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-xl font-bold">ReadyGo</h1>
              <p className="text-sm text-gray-400">Consulting Platform</p>
            </div>
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
          <SidebarContent />
        </>
      )}
    </aside>
  );
}

