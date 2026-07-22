import { route, notFound, bad } from '@/lib/http';
import { PurchaseOrder, Material } from '@/lib/models';
import { applyMovement } from '@/lib/stock';
import { postSafely } from '@/lib/accounting/ledger';
import { postingsForReceipt } from '@/lib/accounting/postings';
import { logAction } from '@/lib/audit';
import { money, num } from '@/lib/util';

export const dynamic = 'force-dynamic';

/**
 * Take delivery of some or all of a purchase order.
 *
 * Three things happen together, and all three matter:
 *   1. Stock goes up, through the normal movement log so it reconciles
 *   2. The supplier is now owed money  (Dr Inventory, Cr Accounts payable)
 *   3. The material's cost price is updated to a weighted average, so future
 *      profit figures use what the paper actually cost rather than a number
 *      typed in months ago
 */
export const POST = route(
  async ({ params, body, user, req }) => {
    const po = await PurchaseOrder.findById(params.id);
    if (!po) throw notFound('Purchase order not found');
    if (po.status === 'cancelled') throw bad('This order was cancelled');
    if (po.status === 'received') throw bad('This order has already been fully received');

    const requested = Array.isArray(body.lines) ? body.lines : [];
    if (!requested.length) throw bad('Say what actually arrived');

    const receiptLines = [];
    let receiptValue = 0;

    for (const line of requested) {
      const item = po.items.find((i) => String(i.material) === String(line.material));
      if (!item) continue;

      const outstanding = money(item.quantity - item.received);
      const quantity = num(line.quantity);
      if (quantity <= 0) continue;

      if (quantity > outstanding + 0.001) {
        throw bad(`You cannot receive more ${item.name} than was ordered — ${outstanding} ${item.unit} still due.`);
      }

      // The price on the delivery note can differ from the price on the order.
      const unitCost = line.unitCost !== undefined && line.unitCost !== '' ? money(line.unitCost) : item.unitCost;
      const value = money(quantity * unitCost);

      item.received = money(item.received + quantity);
      receiptValue = money(receiptValue + value);
      receiptLines.push({ material: item.material, name: item.name, quantity, unitCost });

      // Weighted average cost. Buying 100 sheets at ₦120 when 50 at ₦100 are
      // already on the shelf gives a cost of ₦113.33, not ₦120.
      const material = await Material.findById(item.material);
      if (material) {
        const held = num(material.quantity);
        const newCost =
          held + quantity > 0
            ? money((held * num(material.unitCost) + quantity * unitCost) / (held + quantity))
            : unitCost;
        material.unitCost = newCost;
        await material.save();
      }

      await applyMovement({
        materialId: item.material,
        type: 'in',
        quantity,
        reason: `Received on ${po.poNumber}`,
        user,
        purchaseOrder: po._id, // stops the movement posting its own entry
      });
    }

    if (!receiptLines.length) throw bad('Nothing was received');

    po.receipts.push({ at: new Date(), by: user.name, value: receiptValue, lines: receiptLines });

    const fullyReceived = po.items.every((i) => i.received >= i.quantity - 0.001);
    po.status = fullyReceived ? 'received' : 'part_received';
    if (fullyReceived) po.receivedAt = new Date();
    if (body.supplierInvoiceNo) po.supplierInvoiceNo = body.supplierInvoiceNo.trim();

    // What is owed follows what has actually arrived, not what was ordered —
    // you do not owe a supplier for paper still sitting in their warehouse.
    const receivedValue = money(po.receipts.reduce((s, r) => s + r.value, 0));
    po.total = receivedValue;
    po.balance = money(receivedValue - po.amountPaid);

    await po.save();

    await postSafely(postingsForReceipt(po.toObject(), po.receipts.length - 1));

    await logAction(user, 'purchase.receive', {
      entity: 'PurchaseOrder',
      entityId: po._id,
      label: `Received ${receiptValue} of goods on ${po.poNumber}`,
      details: { value: receiptValue, lines: receiptLines.length, status: po.status },
      req,
    });

    return { order: po.toObject() };
  },
  { role: 'owner' }
);
