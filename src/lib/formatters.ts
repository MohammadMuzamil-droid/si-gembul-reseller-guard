/** Formats a signed Rupiah amount without producing forms such as "+Rp -50.001". */
export function formatSignedRupiah(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const sign = safeValue < 0 ? '-' : safeValue > 0 ? '+' : '';
  return `${sign}Rp${Math.abs(safeValue).toLocaleString('id-ID')}`;
}
