<?php

namespace App\Services;

use App\Models\Device;
use App\Models\DeviceEvent;
use App\Models\DeviceIdentifier;
use App\Models\Product;
use App\Models\StockMovement;
use App\Support\Imei;
use Illuminate\Support\Facades\Auth;

/**
 * Every stock change goes through here so it always leaves a traceable movement.
 * Sellable stock = products.qty (quantity items) or devices with status in_stock (serialized).
 */
final class Inventory
{
    public const STATUS_LABELS = [
        'in_stock' => 'In stock', 'sold' => 'Sold', 'returned' => 'Returned (inspection)', 'damaged' => 'Damaged', 'missing' => 'Missing',
        'repair' => 'Under repair', 'supplier_return' => 'Returned to supplier', 'warranty_return' => 'Warranty return (defective)',
    ];

    public static function move(int $productId, int $qty, string $type, ?string $ref = null, ?string $note = null, ?int $deviceId = null): void
    {
        StockMovement::create([
            'product_id' => $productId, 'device_id' => $deviceId, 'qty' => $qty, 'type' => $type,
            'ref' => $ref, 'note' => $note ? mb_substr($note, 0, 250) : null, 'user_id' => Auth::id(),
        ]);
    }

    public static function event(Device $device, string $type, ?string $ref, string $note): void
    {
        DeviceEvent::create(['device_id' => $device->id, 'type' => $type, 'ref' => $ref, 'note' => $note, 'user_id' => Auth::id()]);
    }

    public static function findDevice(?string $code): ?Device
    {
        $k = Imei::normalize($code);
        if ($k === '') {
            return null;
        }
        $id = DeviceIdentifier::where('code', $k)->value('device_id');

        return $id ? Device::find($id) : null;
    }

    public static function stockOf(Product $p): int
    {
        return $p->tracking === 'qty'
            ? (int) $p->qty
            : Device::where('product_id', $p->id)->where('status', 'in_stock')->count();
    }

    public static function code(Device $d): string
    {
        return $d->imei1 ?: ($d->serial ?: '—');
    }

    public static function label(string $status): string
    {
        return self::STATUS_LABELS[$status] ?? $status;
    }

    /** Create a unit with its identifiers. The unique index on device_identifiers.code blocks duplicates. */
    public static function register(Product $product, array $unit, array $attrs): Device
    {
        $device = Device::create($attrs + [
            'product_id' => $product->id,
            'imei1' => Imei::normalize($unit['imei1'] ?? '') ?: null,
            'imei2' => Imei::normalize($unit['imei2'] ?? '') ?: null,
            'serial' => Imei::normalize($unit['serial'] ?? '') ?: null,
        ]);
        foreach (['imei1', 'imei2', 'serial'] as $type) {
            if ($device->$type) {
                DeviceIdentifier::create(['device_id' => $device->id, 'code' => $device->$type, 'type' => $type]);
            }
        }

        return $device;
    }
}
