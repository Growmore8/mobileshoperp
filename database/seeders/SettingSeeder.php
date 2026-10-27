<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingSeeder extends Seeder
{
    public static function defaults(): array
    {
        return [
            'shop_name' => 'Singtel Mobile',
            'tagline' => 'Phones • Accessories • Repairs',
            'address' => 'No.158/c, Main Street, Matale',
            'phone' => '077 679 7495',
            'email' => 'Singtelmobiles02@gmail.com',
            'tax_id' => '',
            'currency' => 'Rs.',
            'tax_name' => 'VAT',
            'tax_rate' => 8,
            'tax_inclusive' => true,
            'invoice_prefix' => 'INV-',
            'invoice_footer' => 'Thank you for shopping with us! Returns accepted within 7 days with the original invoice and packaging, subject to inspection.',
            'costing' => 'Serialised devices: actual purchase cost per IMEI. Quantity items: weighted average cost.',
            'warranty_start' => 'sale',
            'repair_warranty_start' => 'delivery',
            'expiring_days' => 30,
            'require_signature' => true,
            'payment_methods' => ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet'],
            'expense_categories' => ['Rent', 'Salaries', 'Electricity', 'Internet & Phone', 'Marketing', 'Maintenance', 'Transport', 'Refreshments', 'Bank Charges', 'Other'],
            'repair_types' => [
                ['name' => 'Screen replacement', 'labor_days' => 30],
                ['name' => 'Battery replacement', 'labor_days' => 30],
                ['name' => 'Charging port repair', 'labor_days' => 30],
                ['name' => 'Back glass replacement', 'labor_days' => 15],
                ['name' => 'Camera repair', 'labor_days' => 30],
                ['name' => 'Speaker / mic repair', 'labor_days' => 30],
                ['name' => 'Software / flashing', 'labor_days' => 7],
                ['name' => 'Water damage service', 'labor_days' => 0],
                ['name' => 'Motherboard repair', 'labor_days' => 15],
                ['name' => 'General service', 'labor_days' => 7],
            ],
            'terms' => [
                'product' => 'Covers manufacturing defects under normal use for the stated period. Excludes physical/impact damage, liquid damage, burn marks, unauthorised repairs or opened seals, software tampering, and consumables. Warranty card and invoice must be presented.',
                'used' => 'Shop warranty for used/refurbished devices covers motherboard and display functional faults only. Excludes battery health, cosmetic wear, physical/liquid damage and accessories.',
                'repair' => 'Repair warranty covers only the replaced parts and the specific service performed, for the stated periods. It does not extend or replace the original product warranty. Void if the device is physically damaged, liquid-damaged, or opened by another party.',
            ],
            'notify' => ['low_stock' => true, 'overdue_repairs' => true, 'ready_for_collection' => true, 'warranty_expiry' => true, 'pending_claims' => true, 'receivables' => true],
            'channels' => ['sms' => false, 'email' => false, 'whatsapp' => false],
        ];
    }

    public function run(): void
    {
        foreach (self::defaults() as $key => $value) {
            if (Setting::query()->whereKey($key)->doesntExist()) { // never overwrite settings the shop has changed
                Setting::put($key, $value);
            }
        }
    }
}
