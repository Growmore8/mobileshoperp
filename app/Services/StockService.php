<?php

namespace App\Services;

use App\Models\Device;
use App\Models\Product;
use App\Models\StockAdjustment;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/** Stock adjustments: requested by staff, applied immediately only for users with Inventory “Approve”. */
class StockService
{
    public const DEVICE_TYPES = ['Damaged' => 'damaged', 'Missing' => 'missing', 'Mark defective' => 'damaged', 'Return to stock' => 'in_stock'];

    public static function request(array $d): StockAdjustment
    {
        return DB::transaction(function () use ($d) {
            $p = Product::findOrFail($d['product_id']);
            if ($p->tracking !== 'qty' && empty($d['device_id'])) {
                Shop::fail('Select the specific IMEI / serial unit.');
            }
            if ($p->tracking === 'qty' && (int) ($d['qty'] ?? 0) === 0) {
                Shop::fail('Enter a non-zero quantity.');
            }
            if ($p->tracking !== 'qty' && ! isset(self::DEVICE_TYPES[$d['type']])) {
                Shop::fail('Invalid adjustment type for a serialized unit.');
            }
            $adj = StockAdjustment::create([
                'no' => DocNumber::next('adj', 'ADJ-'), 'product_id' => $p->id, 'device_id' => $d['device_id'] ?? null,
                'qty' => $p->tracking === 'qty' ? (int) $d['qty'] : 0, 'type' => $d['type'], 'reason' => $d['reason'],
                'status' => 'pending', 'requested_by' => Auth::id(),
            ]);
            Audit::log('inventory', 'Adjustment requested', "{$adj->no}: {$p->name} — {$adj->type}. {$adj->reason}", $adj->no);
            if (Shop::can('inventory', 'approve')) {
                self::apply($adj);
            }

            return $adj->fresh();
        });
    }

    public static function approve(StockAdjustment $adj): StockAdjustment
    {
        return DB::transaction(function () use ($adj) {
            $adj = StockAdjustment::lockForUpdate()->findOrFail($adj->id);
            if ($adj->status !== 'pending') {
                Shop::fail('This adjustment has already been processed.');
            }
            self::apply($adj);

            return $adj->fresh();
        });
    }

    public static function reject(StockAdjustment $adj, ?string $note): StockAdjustment
    {
        if ($adj->status !== 'pending') {
            Shop::fail('This adjustment has already been processed.');
        }
        $adj->update(['status' => 'rejected', 'approved_by' => Auth::id(), 'approved_at' => now(), 'reject_note' => $note]);
        Audit::log('inventory', 'Adjustment rejected', "{$adj->no}: ".($note ?? ''), $adj->no);

        return $adj;
    }

    private static function apply(StockAdjustment $adj): void
    {
        $p = Product::lockForUpdate()->findOrFail($adj->product_id);
        if ($p->tracking !== 'qty') {
            $d = Device::lockForUpdate()->findOrFail($adj->device_id);
            $new = self::DEVICE_TYPES[$adj->type];
            if ($new === 'in_stock' && ! in_array($d->status, ['returned', 'damaged', 'missing'], true)) {
                Shop::fail('Only returned, damaged or missing units can be put back into stock.');
            }
            if ($new !== 'in_stock' && ! in_array($d->status, ['in_stock', 'returned'], true)) {
                Shop::fail('Unit is '.Inventory::label($d->status).'; adjustment not allowed.');
            }
            $wasInStock = $d->status === 'in_stock';
            $d->update(['status' => $new, 'condition' => $new === 'damaged' ? 'damaged' : $d->condition]);
            Inventory::event($d, "Adjustment: {$adj->type}", $adj->no, $adj->reason);
            $delta = $new === 'in_stock' ? 1 : ($wasInStock ? -1 : 0);
            Inventory::move($p->id, $delta, "Adjustment – {$adj->type}", $adj->no, $adj->reason, $d->id);
        } else {
            if ($p->qty + $adj->qty < 0) {
                Shop::fail("{$p->name}: adjustment would make stock negative (on hand {$p->qty}).");
            }
            $p->increment('qty', $adj->qty);
            Inventory::move($p->id, $adj->qty, "Adjustment – {$adj->type}", $adj->no, $adj->reason);
        }
        $adj->update(['status' => 'approved', 'approved_by' => Auth::id(), 'approved_at' => now()]);
        Audit::log('inventory', 'Adjustment approved', "{$adj->no}: {$p->name} — {$adj->type}", $adj->no);
    }
}
