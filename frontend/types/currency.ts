/**
 * Currency constants and types.
 */

export const CURRENCIES = [
  { value: "USD", label: "USD - US Dollar" },
  { value: "PHP", label: "PHP - Philippine Peso" },
  { value: "VND", label: "VND - Vietnamese Dong" },
  { value: "THB", label: "THB - Thai Baht" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "AUD", label: "AUD - Australian Dollar" },
  { value: "SGD", label: "SGD - Singapore Dollar" },
  { value: "JPY", label: "JPY - Japanese Yen" },
  { value: "CNY", label: "CNY - Chinese Yuan" },
] as const;

export type Currency = typeof CURRENCIES[number]["value"];








