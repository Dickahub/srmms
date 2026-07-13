// FCFA (XAF) has no subunit — always a whole number, grouped in thousands with a
// literal space (not Intl's locale-dependent narrow-no-break-space), suffixed "FCFA".
export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount);
  const grouped = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${grouped} FCFA`;
}
