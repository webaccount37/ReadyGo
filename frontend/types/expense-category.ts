export interface ExpenseCategory {
  id: number;
  name: string;
  in_use: boolean;
}

export interface ExpenseCategoryListResponse {
  items: ExpenseCategory[];
  total: number;
}

export interface ExpenseCategoryCreate {
  name: string;
}

export interface ExpenseCategoryUpdate {
  name: string;
}
