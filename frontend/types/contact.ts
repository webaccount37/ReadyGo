/**
 * Contact types matching backend schemas.
 */

export interface Contact {
  id: string;
  account_id: string;
  account_name?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  is_primary: boolean;
}

export interface ContactCreate {
  account_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  is_primary?: boolean;
}

export interface ContactUpdate {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  job_title?: string;
  is_primary?: boolean;
}

export type ContactResponse = Contact;

export interface ContactListResponse {
  items: ContactResponse[];
  total: number;
}

