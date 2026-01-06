/**
 * Contact types matching backend schemas.
 */

export interface Contact {
  id: string;
  account_id: string;
  account_name?: string;
  account_type?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  is_primary: boolean;
  is_billing: boolean;
}

export interface ContactCreate {
  account_id?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  is_primary?: boolean;
  is_billing?: boolean;
  // For inline account creation
  create_account?: {
    company_name: string;
    type: string;
    country: string;
    default_currency: string;
    billing_term_id?: string;
  };
}

export interface ContactUpdate {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  job_title?: string;
  is_primary?: boolean;
  is_billing?: boolean;
}

export type ContactResponse = Contact;

export interface ContactListResponse {
  items: ContactResponse[];
  total: number;
}

