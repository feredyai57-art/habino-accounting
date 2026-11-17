import { InvoiceItem } from '../types';

export function calculateItemTotal(item: InvoiceItem, includeTax = true): number {
  const base = Math.max(0, (item.quantity * item.unitPrice) - (item.discount || 0));
  const tax = includeTax ? base * ((item.taxRate || 0) / 100) : 0;
  return base + tax;
}

export function calculateSubtotal(items: InvoiceItem[]): number {
  return items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
}

export function calculateTotalDiscount(items: InvoiceItem[]): number {
  return items.reduce((acc, item) => acc + (item.discount || 0), 0);
}

export function applyInvoiceWideDiscount(items: InvoiceItem[], discount: number): InvoiceItem[] {
  const remainingBases = items.map(item =>
    Math.max(0, item.quantity * item.unitPrice - (item.discount || 0))
  );
  const availableDiscount = remainingBases.reduce((total, base) => total + base, 0);
  if (!Number.isFinite(discount) || discount <= 0 || discount > availableDiscount) return items;

  const lastEligibleIndex = remainingBases.reduce(
    (lastIndex, base, index) => base > 0 ? index : lastIndex,
    -1
  );
  let allocatedDiscount = 0;
  return items.map((item, index) => {
    const remainingBase = remainingBases[index];
    if (remainingBase <= 0) return item;

    const itemDiscount = index === lastEligibleIndex
      ? Math.min(remainingBase, discount - allocatedDiscount)
      : Math.min(remainingBase, discount * (remainingBase / availableDiscount));
    allocatedDiscount += itemDiscount;

    return {
      ...item,
      discount: (item.discount || 0) + itemDiscount
    };
  });
}

export function calculateTotalTax(items: InvoiceItem[]): number {
  return items.reduce((acc, item) => {
    const base = Math.max(0, (item.quantity * item.unitPrice) - (item.discount || 0));
    return acc + (base * ((item.taxRate || 0) / 100));
  }, 0);
}

export function calculateTotal(items: InvoiceItem[]): number {
  return items.reduce((acc, item) => acc + calculateItemTotal(item), 0);
}
