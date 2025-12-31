/**
 * Calendar types matching backend schemas.
 */

export interface Calendar {
  id: string;
  year: number;
  month: number;
  day: number;
  is_holiday: boolean;
  holiday_name?: string;
  financial_period?: string;
  working_hours: number;
  notes?: string;
}

export interface CalendarCreate {
  year: number;
  month: number;
  day: number;
  is_holiday?: boolean;
  holiday_name?: string;
  financial_period?: string;
  working_hours?: number;
  notes?: string;
}

export interface CalendarUpdate {
  year?: number;
  month?: number;
  day?: number;
  is_holiday?: boolean;
  holiday_name?: string;
  financial_period?: string;
  working_hours?: number;
  notes?: string;
}

export type CalendarResponse = Calendar;

export interface CalendarListResponse {
  items: CalendarResponse[];
  total: number;
}










