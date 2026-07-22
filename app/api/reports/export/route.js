import { route, bad } from '@/lib/http';
import {
  Sale,
  Payment,
  Job,
  StockMovement,
  Customer,
  Expense,
  PAYMENT_METHOD_LABELS,
  MOVEMENT_LABELS,
} from '@/lib/models';
import { buildReport } from '@/lib/reports';
import { resolveRange, toCSV, fmtDateTime, fmtDate } from '@/lib/util';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * CSV export. Excel and Google Sheets both open these directly, which is a
 * far better fit for a small business than a PDF generator: the owner can
 * sort, filter and total the numbers himself. PDFs come from the browser's
 * own "Print → Save as PDF" on the printable report page.
 */
export const GET = route(
  async ({ query, user, req }) => {
    const range = resolveRange(query);
    const match = { createdAt: { $gte: range.from, $lte: range.to } };
    const type = query.type || 'summary';

    let rows = [];
    let columns = [];

    if (type === 'sales') {
      rows = await Sale.find({ ...match, voided: false }).sort({ createdAt: 1 }).lean();
      columns = [
        { label: 'Date', value: (r) => fmtDateTime(r.createdAt) },
        { label: 'Invoice', value: 'invoiceNumber' },
        { label: 'Job', value: (r) => r.jobNumber || '' },
        { label: 'Customer', value: 'customerName' },
        { label: 'Items', value: (r) => r.items.map((i) => `${i.quantity} x ${i.description}`).join(' | ') },
        { label: 'Subtotal', value: 'subtotal' },
        { label: 'Discount', value: 'discount' },
        { label: 'Total', value: 'total' },
        { label: 'Paid', value: 'amountPaid' },
        { label: 'Balance', value: 'balance' },
        { label: 'Status', value: 'status' },
        { label: 'Material cost', value: 'materialCost' },
        { label: 'Estimated profit', value: (r) => Math.round((r.total - r.materialCost) * 100) / 100 },
        { label: 'Recorded by', value: 'createdByName' },
      ];
    } else if (type === 'payments') {
      rows = await Payment.find({ ...match, voided: false }).sort({ createdAt: 1 }).lean();
      columns = [
        { label: 'Date', value: (r) => fmtDateTime(r.createdAt) },
        { label: 'Invoice', value: 'invoiceNumber' },
        { label: 'Customer', value: 'customerName' },
        { label: 'Method', value: (r) => PAYMENT_METHOD_LABELS[r.method] || r.method },
        { label: 'Amount', value: 'amount' },
        { label: 'Reference', value: (r) => r.reference || '' },
        { label: 'Type', value: (r) => (r.isRefund ? 'Refund' : r.isDeposit ? 'Deposit' : 'Payment') },
        { label: 'Note', value: (r) => r.note || '' },
        { label: 'Received by', value: 'receivedByName' },
      ];
    } else if (type === 'jobs') {
      rows = await Job.find(match).sort({ createdAt: 1 }).lean();
      columns = [
        { label: 'Date', value: (r) => fmtDateTime(r.createdAt) },
        { label: 'Job no.', value: 'jobNumber' },
        { label: 'Customer', value: 'customerName' },
        { label: 'Type', value: 'jobType' },
        { label: 'Description', value: (r) => r.description || '' },
        {
          label: 'Items',
          value: (r) =>
            (r.items || [])
              .map((i) => `${i.quantity} x ${i.description || i.jobType}${i.specs?.size ? ` (${i.specs.size})` : ''}`)
              .join(' | '),
        },
        { label: 'Total pieces', value: 'quantity' },
        { label: 'Size', value: (r) => r.items?.[0]?.specs?.size || r.specs?.size || '' },
        { label: 'Paper', value: (r) => r.items?.[0]?.specs?.paper || r.specs?.paper || '' },
        { label: 'Finishing', value: (r) => r.items?.[0]?.specs?.finishing || r.specs?.finishing || '' },
        { label: 'Rush', value: (r) => (r.isRush ? 'YES' : '') },
        { label: 'Status', value: 'status' },
        { label: 'Collection', value: 'collectionStatus' },
        { label: 'Deadline', value: (r) => fmtDate(r.deadline) },
        { label: 'Price', value: (r) => r.price - r.discount },
        {
          label: 'Material cost',
          value: (r) => Math.round((r.materials || []).reduce((s, m) => s + m.quantity * m.unitCost, 0) * 100) / 100,
        },
        { label: 'Assigned to', value: (r) => r.assignedToName || '' },
        { label: 'Created by', value: 'createdByName' },
      ];
    } else if (type === 'stock') {
      rows = await StockMovement.find(match).sort({ createdAt: 1 }).lean();
      columns = [
        { label: 'Date', value: (r) => fmtDateTime(r.createdAt) },
        { label: 'Material', value: 'materialName' },
        { label: 'Movement', value: (r) => MOVEMENT_LABELS[r.type] || r.type },
        { label: 'Quantity', value: 'quantity' },
        { label: 'Unit', value: 'unit' },
        { label: 'Change', value: 'delta' },
        { label: 'Balance after', value: 'balanceAfter' },
        { label: 'Unit cost', value: 'unitCost' },
        { label: 'Value', value: (r) => Math.round(r.quantity * r.unitCost * 100) / 100 },
        { label: 'Reason', value: (r) => r.reason || '' },
        { label: 'Job', value: (r) => r.jobNumber || '' },
        { label: 'Staff', value: 'userName' },
      ];
    } else if (type === 'debtors') {
      // Everyone who owes, regardless of when the invoice was raised.
      rows = await Sale.find({ voided: false, balance: { $gt: 0 } }).sort({ balance: -1 }).lean();
      columns = [
        { label: 'Invoice', value: 'invoiceNumber' },
        { label: 'Date', value: (r) => fmtDate(r.createdAt) },
        { label: 'Customer', value: 'customerName' },
        { label: 'Phone', value: (r) => r.customerPhone || '' },
        { label: 'Total', value: 'total' },
        { label: 'Paid', value: 'amountPaid' },
        { label: 'Balance owed', value: 'balance' },
        { label: 'Days old', value: (r) => Math.floor((Date.now() - new Date(r.createdAt)) / 86400000) },
        { label: 'Due date', value: (r) => fmtDate(r.dueDate) },
        { label: 'Reminders sent', value: 'reminderCount' },
      ];
    } else if (type === 'expenses') {
      rows = await Expense.find({ date: { $gte: range.from, $lte: range.to } }).sort({ date: 1 }).lean();
      columns = [
        { label: 'Date', value: (r) => fmtDate(r.date) },
        { label: 'Category', value: 'category' },
        { label: 'Description', value: 'description' },
        { label: 'Amount', value: 'amount' },
        { label: 'Paid by', value: (r) => PAYMENT_METHOD_LABELS[r.paymentMethod] || r.paymentMethod },
        { label: 'From till', value: (r) => (r.paidFromTill ? 'YES' : '') },
        { label: 'Notes', value: (r) => r.notes || '' },
        { label: 'Recorded by', value: 'recordedByName' },
      ];
    } else if (type === 'customers') {
      rows = await Customer.find({}).sort({ totalBilled: -1 }).lean();
      columns = [
        { label: 'Name', value: 'name' },
        { label: 'Phone', value: (r) => r.phone || '' },
        { label: 'Company', value: (r) => r.company || '' },
        { label: 'Jobs', value: 'jobCount' },
        { label: 'Total billed', value: 'totalBilled' },
        { label: 'Total paid', value: 'totalPaid' },
        { label: 'Outstanding', value: 'outstanding' },
        { label: 'Repeat customer', value: (r) => (r.jobCount >= 2 ? 'YES' : '') },
        { label: 'Last job', value: (r) => fmtDate(r.lastJobAt) },
      ];
    } else if (type === 'summary') {
      const report = await buildReport(range);
      rows = [
        ['Period', range.label],
        ['Work invoiced', report.summary.billed],
        ['Money collected', report.summary.collected],
        ['— Cash', report.byMethod.cash],
        ['— Bank transfer', report.byMethod.transfer],
        ['— POS / card', report.byMethod.pos],
        ['— Online (Paystack)', report.byMethod.online],
        ['Discounts given', report.summary.discount],
        ['Refunds', report.summary.refunds],
        ['Material cost', report.summary.materialCost],
        ['Wastage value', report.summary.wastageValue],
        ['Gross margin', report.summary.grossMargin],
        ['Running costs (expenses)', report.summary.expenses],
        ['Net profit', report.summary.netProfit],
        ['Invoices raised', report.summary.invoiceCount],
        ['Jobs created', report.summary.jobsCreated],
        ['Jobs completed', report.summary.jobsCompleted],
        ['Outstanding (all time)', report.summary.outstanding],
        ['Till shortfalls', report.register.shortfall],
      ].map(([label, value]) => ({ label, value }));
      columns = [
        { label: 'Figure', value: 'label' },
        { label: 'Value', value: 'value' },
      ];
    } else {
      throw bad('Unknown export type');
    }

    await logAction(user, 'report.export', {
      entity: 'Report',
      label: `Exported ${type} for ${range.label} (${rows.length} rows)`,
      req,
    });

    const filename = `${type}-${range.from.toISOString().slice(0, 10)}-to-${range.to
      .toISOString()
      .slice(0, 10)}.csv`;

    return new Response(toCSV(rows, columns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  },
  { role: 'owner' }
);
