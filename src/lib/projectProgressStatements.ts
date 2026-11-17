import { ProjectProgressStatement, ProjectProgressStatementLine } from '../types';

export interface ProjectProgressStatementTotals {
  previousAmount: number;
  currentAmount: number;
  cumulativeAmount: number;
  vatAmount: number;
  deductionsAmount: number;
  payableAmount: number;
}

export function calculateProjectProgressStatementTotals(
  lines: ProjectProgressStatementLine[],
  vatRate: number,
  deductions: ProjectProgressStatement['deductions']
): ProjectProgressStatementTotals {
  const amounts = lines.reduce((totals, line) => {
    const rate = Math.max(0, Number(line.unitRate) || 0);
    totals.previousAmount += Math.max(0, Number(line.previousQuantity) || 0) * rate;
    totals.currentAmount += Math.max(0, Number(line.currentQuantity) || 0) * rate;
    return totals;
  }, { previousAmount: 0, currentAmount: 0 });

  const vatAmount = amounts.currentAmount * Math.min(100, Math.max(0, Number(vatRate) || 0)) / 100;
  const deductionsAmount = deductions.reduce(
    (total, deduction) => total + Math.max(0, Number(deduction.amount) || 0),
    0
  );

  return {
    ...amounts,
    cumulativeAmount: amounts.previousAmount + amounts.currentAmount,
    vatAmount,
    deductionsAmount,
    payableAmount: amounts.currentAmount + vatAmount - deductionsAmount
  };
}

export function getProjectProgressStatementCumulativeTotals(
  statements: ProjectProgressStatement[]
): number {
  return statements
    .filter(statement => statement.status === 'approved')
    .reduce((total, statement) => {
      const currentTotal = statement.lines.reduce(
        (sum, line) => sum + Math.max(0, Number(line.currentQuantity) || 0) * Math.max(0, Number(line.unitRate) || 0),
        0
      );
      return total + currentTotal;
    }, 0);
}
