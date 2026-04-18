"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useEmployee,
  useEmployeeUtilization,
} from "@/hooks/useEmployees";
import { employeesApi } from "@/lib/api/employees";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { EmployeeForm } from "@/components/employees/employee-form";
import { EmployeeRelationships } from "@/components/employees/employee-relationships";
import { Trash2, ChevronDown, ChevronUp, Eye, Pencil } from "lucide-react";
import type { EmployeeCreate, EmployeeUpdate } from "@/types/employee";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { useMemo } from "react";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SortableTh, type SortState } from "@/components/ui/sortable-th";

function EmployeesPageContent() {
  const searchParams = useSearchParams();
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ column: "last_name", direction: "asc" });
  const debouncedSearch = useDebouncedValue(searchQuery, 350);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setExpandedEmployeeId(null);
      }
    };

    if (expandedEmployeeId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [expandedEmployeeId]);

  // Initialize search query from URL parameter
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParams]);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, sort.column, sort.direction]);

  const handleSort = (column: string) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    );
  };

  const { data, isLoading, error, refetch } = useEmployees({
    skip,
    limit,
    search: debouncedSearch.trim() || undefined,
    sort_by: sort.column || undefined,
    sort_order: sort.direction,
  });
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: utilizationData } = useEmployeeUtilization();

  const handleCreate = async (data: EmployeeCreate | EmployeeUpdate) => {
    try {
      await createEmployee.mutateAsync(data as EmployeeCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create employee:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: EmployeeCreate | EmployeeUpdate) => {
    if (!editingEmployee) return;
    try {
      await updateEmployee.mutateAsync({ id: editingEmployee, data: data as EmployeeUpdate });
      refetch();
      refetchEmployee();
    } catch (err) {
      console.error("Failed to update employee:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      throw err; // Re-throw so the form knows the update failed
    }
  };

  const handleRelationshipsUpdate = async () => {
    // Refetch the employee with relationships to get updated data
    await refetchEmployee();
    // Also refetch the list to keep it in sync
    await refetch();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this employee?")) {
      try {
        await deleteEmployee.mutateAsync(id);
        refetch();
      } catch (err) {
        console.error("Failed to delete employee:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const { data: employeeWithRelationships, refetch: refetchEmployee } = useEmployee(
    editingEmployee || "",
    true,
    { 
      enabled: !!editingEmployee,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    }
  );

  const { data: viewingEmployeeWithRelationships } = useEmployee(
    viewingEmployee || "",
    true,
    { 
      enabled: !!viewingEmployee,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    }
  );

  // Fetch employees with relationships for opportunities (for current page items)
  const employeeIdsForRelationships = useMemo(() => (data?.items || []).map(emp => emp.id), [data]);
  const employeeRelationshipsQueries = useQueries({
    queries: employeeIdsForRelationships.map(id => ({
      queryKey: ["employees", "detail", id, true],
      queryFn: () => employeesApi.getEmployee(id, true),
      enabled: !!id,
      staleTime: 30000,
    })),
  });

  // Helper function to get delivery center name from code
  const getDeliveryCenterName = (code: string | undefined): string => {
    if (!code) return "—";
    const dc = deliveryCentersData?.items.find(d => d.code === code);
    return dc?.name || code;
  };

  const rows = data?.items ?? [];

  // Helper function to format currency
  const formatCurrency = (value: number | undefined, currency: string = "USD"): string => {
    if (value === undefined || value === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Helper function to get opportunities data
  const getOpportunities = (employeeId: string) => {
    const employeeData = employeeRelationshipsQueries.find(q => q.data?.id === employeeId)?.data;
    return employeeData?.opportunities || [];
  };

  // Helper to get utilization for an employee
  const getUtilization = (employeeId: string) => {
    const u = utilizationData?.utilization?.[employeeId];
    return {
      mtd: u?.mtd_utilization_pct ?? null,
      ytd: u?.ytd_utilization_pct ?? null,
    };
  };

  const formatUtilization = (pct: number | null): string => {
    if (pct === null || pct === undefined) return "—";
    return `${pct.toFixed(1)}%`;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage your team members and their details
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
          + Add Employee
        </Button>
      </div>

      {isLoading && <div className="text-gray-600">Loading employees...</div>}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">
              Error: {error instanceof Error ? error.message : String(error)}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && (
        <>
          <Card>
            <CardHeader className="px-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle>
                  Employees ({data?.total ?? 0})
                </CardTitle>
                <div className="w-full sm:w-64">
                  <Input
                    type="text"
                    placeholder="Search employees..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2">
              {rows.length > 0 ? (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block w-full">
                      <table className="w-full text-xs table-fixed border-collapse">
                        <colgroup>
                          <col style={{ width: "11%" }} />
                          <col style={{ width: "13%" }} />
                          <col style={{ width: "7%" }} />
                          <col style={{ width: "7%" }} />
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "8%" }} />
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "7%" }} />
                          <col style={{ width: "7%" }} />
                          <col style={{ width: "9%" }} />
                          <col style={{ width: "10%" }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b">
                            <SortableTh label="Name" column="last_name" sort={sort} onSort={handleSort} title="Employee Name" />
                            <SortableTh label="Email" column="email" sort={sort} onSort={handleSort} title="Email Address" />
                            <SortableTh label="Type" column="employee_type" sort={sort} onSort={handleSort} title="Employee Type" />
                            <SortableTh label="Status" column="status" sort={sort} onSort={handleSort} title="Employee Status" />
                            <SortableTh label="ICR" column="internal_cost_rate" sort={sort} onSort={handleSort} title="Internal Cost Rate" />
                            <SortableTh label="IBR" column="internal_bill_rate" sort={sort} onSort={handleSort} title="Internal Bill Rate" />
                            <SortableTh label="EBR" column="external_bill_rate" sort={sort} onSort={handleSort} title="External Bill Rate" />
                            <SortableTh label="DC" column="delivery_center" sort={sort} onSort={handleSort} title="Delivery Center" />
                            <SortableTh label="TZ" column="timezone" sort={sort} onSort={handleSort} title="Timezone" />
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="MTD Utilization %">MTD Util %</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="YTD Utilization %">YTD Util %</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Opportunities">Opps</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Actions">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                        {rows.map((employee) => (
                          <tr 
                            key={employee.id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => setViewingEmployee(employee.id)}
                          >
                            <td className="p-1.5 font-medium text-xs overflow-hidden" title={`${employee.first_name} ${employee.last_name}`}>
                              <span className="truncate block">{highlightText(`${employee.first_name} ${employee.last_name}`, searchQuery)}</span>
                            </td>
                            <td className="p-1.5 truncate text-xs overflow-hidden min-w-0" title={employee.email || "—"}>{employee.email ? highlightText(employee.email, searchQuery) : "—"}</td>
                            <td className="p-1.5 overflow-hidden min-w-0">
                              <span className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-800 whitespace-nowrap">
                                {highlightText(employee.employee_type, searchQuery)}
                              </span>
                            </td>
                            <td className="p-1.5 overflow-hidden min-w-0">
                              <span
                                className={`px-1.5 py-0.5 text-xs rounded whitespace-nowrap ${
                                  employee.status === "active"
                                    ? "bg-green-100 text-green-800"
                                    : employee.status === "on-leave"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {highlightText(employee.status, searchQuery)}
                              </span>
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={employee.internal_cost_rate ? formatCurrency(employee.internal_cost_rate, employee.default_currency || "USD") : "—"}>
                              {employee.internal_cost_rate ? formatCurrency(employee.internal_cost_rate, employee.default_currency || "USD") : "—"}
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={employee.internal_bill_rate ? formatCurrency(employee.internal_bill_rate, employee.default_currency || "USD") : "—"}>
                              {employee.internal_bill_rate ? formatCurrency(employee.internal_bill_rate, employee.default_currency || "USD") : "—"}
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={employee.external_bill_rate ? formatCurrency(employee.external_bill_rate, employee.default_currency || "USD") : "—"}>
                              {employee.external_bill_rate ? formatCurrency(employee.external_bill_rate, employee.default_currency || "USD") : "—"}
                            </td>
                            <td className="p-1.5 truncate text-xs overflow-hidden min-w-0" title={getDeliveryCenterName(employee.delivery_center)}>
                              {getDeliveryCenterName(employee.delivery_center)}
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={employee.timezone || "—"}>
                              {employee.timezone || "—"}
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={`MTD Utilization: ${formatUtilization(getUtilization(employee.id).mtd)}`}>
                              {formatUtilization(getUtilization(employee.id).mtd)}
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={`YTD Utilization: ${formatUtilization(getUtilization(employee.id).ytd)}`}>
                              {formatUtilization(getUtilization(employee.id).ytd)}
                            </td>
                            <td className="p-1.5 min-w-0 text-xs overflow-visible" onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const opportunities = getOpportunities(employee.id);
                                
                                if (opportunities.length === 0) {
                                  return <span className="text-gray-400">—</span>;
                                }

                                const isExpanded = expandedEmployeeId === employee.id;
                                const summary = `${opportunities.length} opp${opportunities.length !== 1 ? 's' : ''}`;

                                return (
                                  <div className="relative" ref={popoverRef}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedEmployeeId(isExpanded ? null : employee.id);
                                      }}
                                      className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200 hover:border-blue-300 transition-colors"
                                      title={`Click to ${isExpanded ? 'collapse' : 'expand'} opportunities`}
                                    >
                                      <span>{summary}</span>
                                      {isExpanded ? (
                                        <ChevronUp className="w-3 h-3" />
                                      ) : (
                                        <ChevronDown className="w-3 h-3" />
                                      )}
                                    </button>
                                    
                                    {isExpanded && (
                                      <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-md shadow-lg p-2 max-w-[300px] max-h-[300px] overflow-y-auto">
                                        <div className="space-y-2 text-xs">
                                          {opportunities.map((opp) => (
                                            <div key={opp.id} className="border-b border-gray-100 pb-1 last:border-0 last:pb-0">
                                              <div className="font-semibold text-blue-700 mb-1">
                                                {opp.name}
                                              </div>
                                              {opp.role_name && (
                                                <div className="pl-2 text-gray-600 text-xs">
                                                  Role: {opp.role_name}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="p-1 overflow-hidden min-w-0">
                              <div className="flex flex-nowrap gap-0.5 justify-start" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingEmployee(employee.id);
                                  }}
                                  className="h-5 w-5 p-0 shrink-0"
                                  title="View"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingEmployee(employee.id);
                                  }}
                                  className="h-5 w-5 p-0 shrink-0"
                                  title="Edit"
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(employee.id);
                                  }}
                                  className="h-5 w-5 p-0 shrink-0 text-red-600 hover:text-red-700"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-4">
                    {rows.map((employee) => (
                      <Card 
                        key={employee.id}
                        className="cursor-pointer"
                        onClick={() => setViewingEmployee(employee.id)}
                      >
                        <CardContent className="pt-6">
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Name
                              </div>
                              <div className="text-sm font-medium">
                                {highlightText(`${employee.first_name} ${employee.last_name}`, searchQuery)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Email
                              </div>
                              <div className="text-sm">{employee.email ? highlightText(employee.email, searchQuery) : "—"}</div>
                            </div>
                            <div className="flex gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Type
                                </div>
                                <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                                  {highlightText(employee.employee_type, searchQuery)}
                                </span>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Status
                                </div>
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    employee.status === "active"
                                      ? "bg-green-100 text-green-800"
                                      : employee.status === "on-leave"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {highlightText(employee.status, searchQuery)}
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  ICR
                                </div>
                                <div className="text-sm">{employee.internal_cost_rate ? formatCurrency(employee.internal_cost_rate, employee.default_currency || "USD") : "—"}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  IBR
                                </div>
                                <div className="text-sm">{employee.internal_bill_rate ? formatCurrency(employee.internal_bill_rate, employee.default_currency || "USD") : "—"}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  EBR
                                </div>
                                <div className="text-sm">{employee.external_bill_rate ? formatCurrency(employee.external_bill_rate, employee.default_currency || "USD") : "—"}</div>
                              </div>
                            </div>
                            {employee.delivery_center && (
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Delivery Center
                                </div>
                                <div className="text-sm">{getDeliveryCenterName(employee.delivery_center)}</div>
                              </div>
                            )}
                            {employee.timezone && (
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Timezone
                                </div>
                                <div className="text-sm">{employee.timezone}</div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  MTD Util %
                                </div>
                                <div className="text-sm">{formatUtilization(getUtilization(employee.id).mtd)}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  YTD Util %
                                </div>
                                <div className="text-sm">{formatUtilization(getUtilization(employee.id).ytd)}</div>
                              </div>
                            </div>
                            {(() => {
                              const opportunities = getOpportunities(employee.id);
                              if (opportunities.length === 0) return null;
                              
                              const isExpanded = expandedEmployeeId === employee.id;
                              const summary = `${opportunities.length} opp${opportunities.length !== 1 ? 's' : ''}`;

                              return (
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                    Opportunities
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedEmployeeId(isExpanded ? null : employee.id);
                                    }}
                                    className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-blue-200 hover:border-blue-300 transition-colors"
                                  >
                                    <span>{summary}</span>
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </button>
                                  
                                  {isExpanded && (
                                    <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-md space-y-2 text-sm">
                                      {opportunities.map((opp) => (
                                        <div key={opp.id} className="border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                                          <div className="font-semibold text-blue-700 mb-1">
                                            {opp.name}
                                          </div>
                                          {opp.role_name && (
                                            <div className="pl-2 text-gray-600 text-xs">
                                              Role: {opp.role_name}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="flex flex-nowrap gap-0.5 justify-start pt-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewingEmployee(employee.id)}
                                className="h-5 w-5 p-0 shrink-0"
                                title="View"
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingEmployee(employee.id)}
                                className="h-5 w-5 p-0 shrink-0"
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(employee.id)}
                                className="h-5 w-5 p-0 shrink-0 text-red-600 hover:text-red-700"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p>
                      {debouncedSearch.trim() 
                        ? `No employees found matching "${debouncedSearch}"` 
                        : "No employees found."}
                    </p>
                    {!debouncedSearch.trim() && (
                      <Button
                        className="mt-4"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        Create First Employee
                      </Button>
                    )}
                  </div>
                )}
            </CardContent>
          </Card>

          {data && data.total > limit && (
            <div className="flex justify-center items-center gap-4 mt-4">
              <Button
                variant="outline"
                onClick={() => setSkip(Math.max(0, skip - limit))}
                disabled={skip === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {Math.floor(skip / limit) + 1} of{" "}
                {Math.ceil(data.total / limit)}
              </span>
              <Button
                variant="outline"
                onClick={() => setSkip(skip + limit)}
                disabled={skip + limit >= data.total}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Create New Employee</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <EmployeeForm
            onSubmit={async (data) => {
              await handleCreate(data);
            }}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createEmployee.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewingEmployee && viewingEmployeeWithRelationships && (
        <Dialog
          open={!!viewingEmployee}
          onOpenChange={(open) => {
            if (!open) setViewingEmployee(null);
          }}
        >
          <DialogHeader>
            <DialogTitle>View Employee</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <EmployeeForm
              initialData={viewingEmployeeWithRelationships}
              onSubmit={async () => {}}
              onCancel={() => setViewingEmployee(null)}
              isLoading={false}
              showRelationships={true}
              relationshipsComponent={
                <EmployeeRelationships
                  employee={viewingEmployeeWithRelationships}
                  onUpdate={handleRelationshipsUpdate}
                  readOnly={true}
                />
              }
              readOnly={true}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      {editingEmployee && employeeWithRelationships && (
        <Dialog
          open={!!editingEmployee}
          onOpenChange={(open) => {
            if (!open) {
              setEditingEmployee(null);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <EmployeeForm
              initialData={employeeWithRelationships}
              onSubmit={async (data) => {
                await handleUpdate(data);
                // Explicitly close the dialog after successful update
                setEditingEmployee(null);
              }}
              onCancel={() => setEditingEmployee(null)}
              isLoading={updateEmployee.isPending}
              showRelationships={true}
              relationshipsComponent={
                <EmployeeRelationships
                  employee={employeeWithRelationships}
                  onUpdate={handleRelationshipsUpdate}
                />
              }
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <EmployeesPageContent />
    </Suspense>
  );
}
