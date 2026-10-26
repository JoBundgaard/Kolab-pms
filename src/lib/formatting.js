

export const formatCurrencyVND = (value = 0) => `${(Number(value) || 0).toLocaleString('vi-VN')} ₫`;

export const formatCompactCurrencyVND = (value = 0) => {
  const amount = Math.round(Number(value) || 0);
  const abs = Math.abs(amount);
  const formatCompact = (divisor) => {
    const scaledAbs = abs / divisor;
    const decimals = scaledAbs >= 100 ? 0 : scaledAbs >= 10 ? 1 : 2;
    return (amount / divisor).toFixed(decimals).replace(/(\.\d*[1-9])0+$|\.0+$/, '$1');
  };
  if (abs >= 1_000_000_000) return `${formatCompact(1_000_000_000)}B VND`;
  if (abs >= 1_000_000) return `${formatCompact(1_000_000)}M VND`;
  if (abs >= 1_000) return `${formatCompact(1_000)}k VND`;
  return `${amount.toLocaleString('vi-VN')} VND`;
};
