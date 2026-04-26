/**
 * Format a numeric dollar amount as a compact human-readable string.
 *
 * Examples:
 *   formatDollars(123) → "$123"
 *   formatDollars(1234) → "$1.2K"
 *   formatDollars(1234567) → "$1.2M"
 *
 * Accepts string amounts (server returns Decimal as string) and parses safely.
 */
export function formatDollars(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!isFinite(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
