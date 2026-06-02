export interface Currency {
  code: string;
  name: string;
  symbol: string;
}

export const CURRENCIES: Currency[] = [
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
];
