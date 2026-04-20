"use client";

import {
  LayoutDashboard,
  Briefcase,
  Building2,
  ContactRound,
  Calculator,
  FileCheck,
  TrendingUp,
  Users,
  Shield,
  Calendar,
  DollarSign,
  MapPin,
  Clock,
  Receipt,
  Tags,
  UserCog,
  CheckCircle2,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  badgeKey?: "timesheet-incomplete" | "timesheet-pending" | "expense-pending" | "quote-pending";
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    items: [{ title: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    title: "Client Management",
    items: [
      { title: "Accounts", href: "/accounts", icon: Building2 },
      { title: "Contacts", href: "/contacts", icon: ContactRound },
      { title: "Opportunities", href: "/opportunities", icon: Briefcase },
    ],
  },
  {
    title: "Project Delivery",
    items: [
      { title: "Estimates", href: "/estimates", icon: Calculator },
      { title: "Quotes", href: "/quotes", icon: FileCheck },
      { title: "Quote Approvals", href: "/quote-approvals", icon: CheckCircle2, badgeKey: "quote-pending" },
      { title: "Engagements", href: "/engagements", icon: Briefcase },
    ],
  },
  {
    title: "Time & Expenses",
    items: [
      { title: "Timesheet Management", href: "/timesheets", icon: Clock, badgeKey: "timesheet-incomplete" },
      { title: "Timesheet Approvals", href: "/timesheet-approvals", icon: CheckCircle2, badgeKey: "timesheet-pending" },
      { title: "Expense Management", href: "/expenses", icon: Receipt },
      { title: "Expense Approvals", href: "/expense-approvals", icon: CheckCircle2, badgeKey: "expense-pending" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { title: "Financial Forecasts", href: "/financial-forecasts", icon: TrendingUp },
      { title: "Staffing Forecasts", href: "/staffing-forecasts", icon: UserCog },
    ],
  },
  {
    title: "Resources",
    items: [
      { title: "Calendars", href: "/calendars", icon: Calendar },
      { title: "Currency Rates", href: "/currency-rates", icon: DollarSign },
      { title: "Expense Categories", href: "/expense-categories", icon: Tags },
      { title: "Delivery Centers", href: "/delivery-centers", icon: MapPin },
      { title: "Employees", href: "/employees", icon: Users },
      { title: "Roles", href: "/roles", icon: Shield },
    ],
  },
];
