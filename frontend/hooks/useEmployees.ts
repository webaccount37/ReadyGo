/**
 * React Query hooks for employees.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { employeesApi } from "@/lib/api/employees";
import type {
  EmployeeResponse,
  EmployeeCreate,
  EmployeeUpdate,
  EmployeeListResponse,
} from "@/types/employee";

const QUERY_KEYS = {
  all: ["employees"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string, includeRelationships?: boolean) => [...QUERY_KEYS.details(), id, includeRelationships] as const,
};

/**
 * Get all employees with optional filters.
 */
export function useEmployees(
  params?: {
    skip?: number;
    limit?: number;
    status?: string;
    employee_type?: string;
    billable?: boolean;
  },
  options?: Omit<UseQueryOptions<EmployeeListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<EmployeeListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => employeesApi.getEmployees(params),
    ...options,
  });
}

/**
 * Get a single employee by ID.
 */
export function useEmployee(
  employeeId: string,
  includeRelationships = false,
  options?: Omit<UseQueryOptions<EmployeeResponse>, "queryKey" | "queryFn">
) {
  return useQuery<EmployeeResponse>({
    queryKey: QUERY_KEYS.detail(employeeId, includeRelationships),
    queryFn: () => employeesApi.getEmployee(employeeId, includeRelationships),
    enabled: !!employeeId,
    ...options,
  });
}

/**
 * Create a new employee.
 */
export function useCreateEmployee(
  options?: UseMutationOptions<EmployeeResponse, Error, EmployeeCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<EmployeeResponse, Error, EmployeeCreate>({
    mutationFn: (data) => employeesApi.createEmployee(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update an employee.
 */
export function useUpdateEmployee(
  options?: UseMutationOptions<EmployeeResponse, Error, { id: string; data: EmployeeUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<EmployeeResponse, Error, { id: string; data: EmployeeUpdate }>({
    mutationFn: ({ id, data }) => employeesApi.updateEmployee(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
    },
    ...options,
  });
}

/**
 * Delete an employee.
 */
export function useDeleteEmployee(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => employeesApi.deleteEmployee(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
    },
    ...options,
  });
}

/**
 * Link employee to an opportunity.
 */
export function useLinkEmployeeToOpportunity(
  options?: UseMutationOptions<void, Error, { employeeId: string; opportunityId: string; linkData: {
    engagements: Array<{
      engagement_id: string;
      role_id: string;
      start_date: string;
      end_date: string;
      project_rate: number;
      project_cost?: number;
      delivery_center: string;
    }>;
  } }>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { employeeId: string; opportunityId: string; linkData: {
    engagements: Array<{
      engagement_id: string;
      role_id: string;
      start_date: string;
      end_date: string;
      project_rate: number;
      project_cost?: number;
      delivery_center: string;
    }>;
  } }>({
    mutationFn: ({ employeeId, opportunityId, linkData }) =>
      employeesApi.linkEmployeeToOpportunity(employeeId, opportunityId, linkData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      // Specifically invalidate the employee detail query with relationships
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.employeeId, true) });
      // Invalidate engagement queries since linking to opportunity also creates engagement associations
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      // Invalidate each engagement detail query that was linked
      variables.linkData.engagements.forEach(engagement => {
        queryClient.invalidateQueries({ queryKey: ["engagements", "detail", engagement.engagement_id] });
      });
    },
    ...options,
  });
}

/**
 * Unlink employee from an opportunity.
 */
export function useUnlinkEmployeeFromOpportunity(
  options?: UseMutationOptions<void, Error, { employeeId: string; opportunityId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { employeeId: string; opportunityId: string }>({
    mutationFn: ({ employeeId, opportunityId }) =>
      employeesApi.unlinkEmployeeFromOpportunity(employeeId, opportunityId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      // Specifically invalidate the employee detail query with relationships
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.employeeId, true) });
      // Invalidate engagement queries since unlinking from opportunity may affect engagement associations
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
    },
    ...options,
  });
}

/**
 * Link employee to an engagement.
 */
export function useLinkEmployeeToEngagement(
  options?: UseMutationOptions<void, Error, { employeeId: string; engagementId: string; linkData: {
    role_id: string;
    start_date: string;
    end_date: string;
    project_rate: number;
    project_cost?: number;
    delivery_center: string;
  } }>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { employeeId: string; engagementId: string; linkData: {
    role_id: string;
    start_date: string;
    end_date: string;
    project_rate: number;
    project_cost?: number;
    delivery_center: string;
  } }>({
    mutationFn: ({ employeeId, engagementId, linkData }) =>
      employeesApi.linkEmployeeToEngagement(employeeId, engagementId, linkData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      // Specifically invalidate the employee detail query with relationships
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.employeeId, true) });
      // Invalidate all engagement queries including detail queries with relationships
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      // Specifically invalidate the engagement detail query for this engagement (with and without relationships)
      queryClient.invalidateQueries({ queryKey: ["engagements", "detail", variables.engagementId] });
    },
    ...options,
  });
}

/**
 * Unlink employee from an engagement.
 */
export function useUnlinkEmployeeFromEngagement(
  options?: UseMutationOptions<void, Error, { employeeId: string; engagementId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { employeeId: string; engagementId: string }>({
    mutationFn: ({ employeeId, engagementId }) =>
      employeesApi.unlinkEmployeeFromEngagement(employeeId, engagementId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      // Specifically invalidate the employee detail query with relationships
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.employeeId, true) });
      // Invalidate all engagement queries including detail queries with relationships
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      // Specifically invalidate the engagement detail query for this engagement (with and without relationships)
      queryClient.invalidateQueries({ queryKey: ["engagements", "detail", variables.engagementId] });
    },
    ...options,
  });
}


