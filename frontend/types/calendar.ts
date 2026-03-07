/**
 * Calendar types matching backend schemas.
 */

export interface Calendar {
  id: string;
  date: string;
  name: string;
  country_code: string;
  hours: number;
  year: number;
  delivery_center_id: string;
}

export interface CalendarCreate {
  date: string;
  name: string;
  country_code: string;
  hours?: number;
  year: number;
  delivery_center_id: string;
}

export interface CalendarUpdate {
  date?: string;
  name?: string;
  country_code?: string;
  hours?: number;
  year?: number;
  delivery_center_id?: string;
}

export type CalendarResponse = Calendar;

export interface CalendarListResponse {
  items: CalendarResponse[];
  total: number;
}

export interface ImportPublicHolidaysRequest {
  year: number;
  delivery_center_id: string;
}
