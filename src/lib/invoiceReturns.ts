import { Invoice, InvoiceItem, InvoiceType } from '../types';
import { calculateItemTotal } from './calculations';

export type ReturnSettlementMethod = 'account' | 'cash';

const isReturnInvoice = (invoice: Invoice): boolean =>
  invoice.type === 'sale_return' || invoice.type === 'purchase_return';

export const getReturnInvoiceType = (sourceType: InvoiceType): InvoiceType => {
  if (sourceType === 'purchase') return 'purchase_return';
  if (sourceType === 'sale' || sourceType === 'service') return 'sale_return';
  throw new Error('برای این نوع سند امکان صدور فاکتور برگشتی وجود ندارد.');
};

const matchesOriginalItem = (returnedItem: InvoiceItem, originalItem: InvoiceItem): boolean => {
  if (returnedItem.sourceItemId) {
    return returnedItem.sourceItemId === originalItem.id &&
      returnedItem.description === originalItem.description &&
      (!originalItem.itemId || returnedItem.itemId === originalItem.itemId);
  }
  if (returnedItem.itemId && originalItem.itemId) return returnedItem.itemId === originalItem.itemId;
  if (returnedItem.code && originalItem.code) return returnedItem.code === originalItem.code;
  return returnedItem.description === originalItem.description &&
    returnedItem.unitPrice === originalItem.unitPrice;
};

export const getReturnedQuantities = (
  sourceInvoice: Invoice,
  allInvoices: Invoice[]
): Record<string, number> => {
  const returned: Record<string, number> = {};
  sourceInvoice.items.forEach(item => { returned[item.id] = 0; });

  const linkedReturns = allInvoices.filter(invoice =>
    isReturnInvoice(invoice) &&
    invoice.metadata?.originalInvoiceId === sourceInvoice.id &&
    invoice.status !== 'cancelled' &&
    !invoice.is_deleted
  );

  for (const returnInvoice of linkedReturns) {
    for (const returnedItem of returnInvoice.items || []) {
      let unallocatedQuantity = Number(returnedItem.quantity) || 0;
      const candidates = sourceInvoice.items.filter(item =>
        matchesOriginalItem(returnedItem, item)
      );

      for (const originalItem of candidates) {
        if (unallocatedQuantity <= 1e-8) break;
        const available = Math.max(
          0,
          (Number(originalItem.quantity) || 0) - (returned[originalItem.id] || 0)
        );
        const allocated = Math.min(available, unallocatedQuantity);
        returned[originalItem.id] = (returned[originalItem.id] || 0) + allocated;
        unallocatedQuantity -= allocated;
      }

      if (unallocatedQuantity > 1e-8) {
        throw new Error(`مقدار برگشتی قبلی برای قلم «${returnedItem.description}» با فاکتور اصلی تطبیق ندارد.`);
      }
    }
  }

  return returned;
};

export const getReturnableItems = (
  sourceInvoice: Invoice,
  allInvoices: Invoice[]
): Array<{ item: InvoiceItem; returnedQuantity: number; availableQuantity: number }> => {
  const returned = getReturnedQuantities(sourceInvoice, allInvoices);
  return sourceInvoice.items.map(item => {
    const returnedQuantity = returned[item.id] || 0;
    return {
      item,
      returnedQuantity,
      availableQuantity: Math.max(0, (Number(item.quantity) || 0) - returnedQuantity)
    };
  });
};

export const buildReturnInvoiceItems = (
  sourceInvoice: Invoice,
  quantities: Record<string, number>
): InvoiceItem[] => sourceInvoice.items.flatMap(item => {
  const quantity = Number(quantities[item.id]) || 0;
  if (quantity <= 0) return [];

  const sourceQuantity = Number(item.quantity) || 0;
  if (quantity > sourceQuantity) {
    throw new Error(`مقدار برگشتی قلم «${item.description}» از مقدار فاکتور اصلی بیشتر است.`);
  }

  const returnedItem: InvoiceItem = {
    ...item,
    id: `${item.id}-return-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceItemId: item.id,
    quantity,
    discount: (Number(item.discount) || 0) * (quantity / sourceQuantity)
  };
  returnedItem.total = calculateItemTotal(returnedItem);
  return [returnedItem];
});

export const getReturnTotals = (items: InvoiceItem[]) => {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalDiscount = items.reduce((sum, item) => sum + (item.discount || 0), 0);
  const totalTax = items.reduce((sum, item) => {
    const taxBase = Math.max(0, (item.quantity * item.unitPrice) - (item.discount || 0));
    return sum + taxBase * ((item.taxRate || 0) / 100);
  }, 0);
  return {
    subtotal,
    totalDiscount,
    totalTax,
    grandTotal: subtotal - totalDiscount + totalTax
  };
};

const amountsMatch = (first: number, second: number): boolean =>
  Math.abs(first - second) <= 0.01;

export const assertReturnQuantitiesAvailable = (
  sourceInvoice: Invoice,
  allInvoices: Invoice[],
  returnItems: InvoiceItem[]
): void => {
  const returned = { ...getReturnedQuantities(sourceInvoice, allInvoices) };
  for (const item of returnItems) {
    let quantityToAllocate = Number(item.quantity) || 0;
    const candidates = sourceInvoice.items.filter(original =>
      matchesOriginalItem(item, original)
    );
    if (!candidates.length || quantityToAllocate <= 0) {
      throw new Error('قلم برگشتی به ردیف معتبر فاکتور اصلی متصل نیست.');
    }

    for (const sourceItem of candidates) {
      if (quantityToAllocate <= 1e-8) break;
      if (item.sourceItemId === sourceItem.id) {
        const sourceQuantity = Number(sourceItem.quantity) || 0;
        if (sourceQuantity <= 0) {
          throw new Error(`مقدار قلم مرجع «${sourceItem.description}» نامعتبر است.`);
        }
        const expectedDiscount = (Number(sourceItem.discount) || 0) *
          (Number(item.quantity) / sourceQuantity);
        if (
          !amountsMatch(item.unitPrice, sourceItem.unitPrice) ||
          !amountsMatch(item.taxRate || 0, sourceItem.taxRate || 0) ||
          !amountsMatch(item.discount || 0, expectedDiscount) ||
          !amountsMatch(item.total, calculateItemTotal(item))
        ) {
          throw new Error(`قیمت، تخفیف یا مالیات قلم «${sourceItem.description}» در فاکتور برگشت با فاکتور اصلی مطابقت ندارد.`);
        }
      }
      const remaining = (Number(sourceItem.quantity) || 0) - (returned[sourceItem.id] || 0);
      const allocated = Math.min(Math.max(0, remaining), quantityToAllocate);
      returned[sourceItem.id] = (returned[sourceItem.id] || 0) + allocated;
      quantityToAllocate -= allocated;
    }

    if (quantityToAllocate > 1e-8) {
      const sourceItem = candidates[0];
      const remaining = candidates.reduce((sum, candidate) =>
        sum + Math.max(0, (Number(candidate.quantity) || 0) - (returned[candidate.id] || 0)), 0
      );
      throw new Error(`مقدار قابل برگشت «${sourceItem.description}» حداکثر ${remaining} است.`);
    }
  }
};
