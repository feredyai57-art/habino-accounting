import { InvoiceType } from '../types';

export const getInvoiceBalanceDelta = (type: InvoiceType, remainingAmount: number): number => {
  switch (type) {
    case 'sale':
    case 'service':
    case 'purchase_return':
      return remainingAmount;
    case 'purchase':
    case 'sale_return':
      return -remainingAmount;
    default:
      return 0;
  }
};
