<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Claim;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Repair;
use App\Models\Role;
use App\Models\Sale;
use App\Models\Setting;
use App\Models\StockAdjustment;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warranty;
use App\Services\CatalogService;
use App\Services\Inventory;
use App\Services\PurchaseService;
use App\Services\RepairService;
use App\Services\SaleService;
use App\Services\StockService;
use App\Services\Totals;
use App\Services\WarrantyService;
use App\Support\Imei;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;

/**
 * Realistic sample data for client presentations (never run in production).
 *   php artisan migrate:fresh --seed --seeder=Database\\Seeders\\DemoSeeder
 * Every record is created through the real services with back-dated clocks, so stock,
 * IMEIs, warranties, balances and the activity log are fully consistent.
 */
class DemoSeeder extends Seeder
{
    private array $u = [];

    private array $p = [];

    private array $c = [];

    private array $s = [];

    private array $usedImei = [];

    private Carbon $realNow;

    public function run(): void
    {
        mt_srand(20261020);
        $this->realNow = Carbon::now();

        $this->call([SettingSeeder::class, RoleSeeder::class]);
        $this->users();
        $this->call(DatabaseSeeder::class); // categories (admin already exists)

        try {
            $this->catalog();
            $this->trading();
            $this->repairsAndClaims();
            $this->misc();
        } finally {
            Carbon::setTestNow();
            Auth::forgetGuards();
        }
        $this->command?->info('Demo data ready. Sign in with admin / admin123 (see README for other demo accounts).');
    }

    /* ---------------- helpers ---------------- */

    private function rint(int $a, int $b): int
    {
        return mt_rand($a, $b);
    }

    private function pick(array $arr): mixed
    {
        return $arr[array_rand($arr)];
    }

    private function at(int $daysAgo, int $hour = 10, int $min = 0): Carbon
    {
        return $this->realNow->copy()->subDays($daysAgo)->setTime($hour, $min);
    }

    /** Run $fn as $user with the clock set to $when (never in the future). */
    private function as(string $user, Carbon $when, callable $fn): mixed
    {
        $when = $when->lt($this->realNow) ? $when : $this->realNow->copy()->subMinute();
        Carbon::setTestNow($when);
        Auth::setUser($this->u[$user]->fresh('role'));

        return $fn();
    }

    private function imei(string $brand): string
    {
        $tac = ['Samsung' => '35467611', 'Apple' => '35395811', 'Xiaomi' => '86412305', 'OnePlus' => '86753104', 'Google' => '35851910', 'Vivo' => '86609905', 'Oppo' => '86718405', 'Realme' => '86257306'][$brand] ?? '35'.$this->rint(100000, 999999);
        do {
            $body = $tac.str_pad((string) $this->rint(0, 999999), 6, '0', STR_PAD_LEFT);
            $im = $body.Imei::checkDigit($body);
        } while (isset($this->usedImei[$im]));
        $this->usedImei[$im] = true;

        return $im;
    }

    private function units(Product $p, int $n): array
    {
        $out = [];
        for ($i = 0; $i < $n; $i++) {
            if ($p->tracking === 'imei') {
                $out[] = ['imei1' => $this->imei($p->brand), 'imei2' => $p->brand === 'Apple' ? null : $this->imei($p->brand)];
            } else {
                $s = ($p->brand === 'Apple' ? 'GQ' : 'RF');
                for ($k = 0; $k < 9; $k++) {
                    $s .= 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'[$this->rint(0, 33)];
                }
                $out[] = ['serial' => $s];
            }
        }

        return $out;
    }

    /* ---------------- staff ---------------- */

    private function users(): void
    {
        $role = fn ($n) => Role::where('name', $n)->value('id');
        foreach ([
            ['admin', 'Daniel Fernando', 'admin123', 'Administrator', true], ['manager', 'Priya Nair', 'manager123', 'Store Manager', true],
            ['sales', 'Kevin Silva', 'sales123', 'Sales Executive', true], ['ayesha', 'Ayesha Rahman', 'ayesha123', 'Sales Executive', true],
            ['tech', 'Rohan Das', 'tech123', 'Technician', true], ['nimal', 'Nimal Perera', 'nimal123', 'Technician', true],
            ['store', 'Sameer Ali', 'store123', 'Store Keeper', true], ['tom', 'Tom Baker', 'tom123', 'Sales Executive', false],
        ] as $i => [$un, $name, $pw, $r, $active]) {
            $this->u[$un] = User::create(['name' => $name, 'username' => $un, 'password' => $pw, 'role_id' => $role($r), 'active' => $active, 'phone' => '077 100 20'.str_pad((string) $i, 2, '0', STR_PAD_LEFT)]);
        }
    }

    /* ---------------- catalog & opening stock ---------------- */

    private function catalog(): void
    {
        $cat = fn ($k) => Category::where('kind', $k)->value('id');
        $this->as('admin', $this->at(432), function () use ($cat) {
            foreach ([
                ['1001', 'Metro Mobile Distributors', 'Anil Gupta', '011 555 0101', 'orders@metromobile.example', '88 Industrial Estate, Block B', 'Net 30'],
                ['1002', 'Apex Device Imports', 'Sarah Lim', '011 555 0202', 'sales@apexdevices.example', '5th Floor, Trade Tower', 'Net 15'],
                ['1003', 'TechLink Accessories Wholesale', 'Imran Shah', '011 555 0303', 'hello@techlink.example', '14 Market Lane', 'Cash on delivery'],
                ['1004', 'SparePoint Parts Co.', 'Ken Watanabe', '011 555 0404', 'parts@sparepoint.example', '201 Electronics Arcade', 'Net 7'],
                ['1005', 'ReNew Devices Trading', 'Maria Gomez', '011 555 0505', 'buy@renewdevices.example', '9 Harbour Road', 'Cash'],
            ] as [$k, $name, $contact, $phone, $email, $addr, $terms]) {
                $this->s[$k] = CatalogService::saveSupplier(compact('name', 'contact', 'phone', 'email') + ['address' => $addr, 'terms' => $terms]);
            }
            $P = function ($key, $name, $kind, $brand, $cost, $price, $o = []) use ($cat) {
                $this->p[$key] = CatalogService::saveProduct($o + [
                    'name' => $name, 'category_id' => $cat($kind), 'brand' => $brand, 'cost' => $cost, 'price' => $price, 'wholesale' => round($price * 0.93),
                    'tracking' => $o['tracking'] ?? 'qty', 'condition' => $o['condition'] ?? 'new', 'min_stock' => $o['min_stock'] ?? 3,
                    'warranty_months' => $o['warranty_months'] ?? Category::find($cat($kind))->warranty_months,
                    'warranty_provider' => $o['warranty_provider'] ?? (in_array($kind, ['phone', 'watch']) ? 'Manufacturer' : 'Distributor'),
                    'used_warranty_months' => $o['used_warranty_months'] ?? 3, 'taxable' => true, 'discountable' => true, 'active' => true,
                    'barcode' => '890'.$this->rint(1000000000, 9999999999),
                ]);
            };
            $ph = fn ($model, $variant, $color, $sup, $min = 2, $o = []) => $o + ['model' => $model, 'variant' => $variant, 'color' => $color, 'tracking' => 'imei', 'supplier_id' => $this->s[$sup]->id, 'min_stock' => $min, 'sku' => strtoupper(substr(preg_replace('/\W/', '', $model), 0, 10)).'-'.$this->rint(100, 999)];
            $P('s24', 'Samsung Galaxy S24 5G 8GB/256GB', 'phone', 'Samsung', 72000, 79999, $ph('Galaxy S24', '8GB / 256GB', 'Onyx Black', '1001', 2, ['description' => '6.2" Dynamic AMOLED 2X, Exynos 2400, 50MP triple camera.']));
            $P('a15', 'Samsung Galaxy A15 6GB/128GB', 'phone', 'Samsung', 15500, 17999, $ph('Galaxy A15', '6GB / 128GB', 'Blue Black', '1001', 3));
            $P('ip15', 'Apple iPhone 15 128GB', 'phone', 'Apple', 66500, 72990, $ph('iPhone 15', '128GB', 'Black', '1002'));
            $P('ip13r', 'Apple iPhone 13 128GB (Refurbished)', 'phone', 'Apple', 34000, 39990, $ph('iPhone 13', '128GB', 'Midnight', '1005', 1, ['condition' => 'refurbished', 'warranty_months' => 6, 'warranty_provider' => 'Shop', 'used_warranty_months' => 6]));
            $P('redmi', 'Xiaomi Redmi Note 13 Pro 8GB/256GB', 'phone', 'Xiaomi', 22000, 25999, $ph('Redmi Note 13 Pro', '8GB / 256GB', 'Midnight Black', '1001'));
            $P('op12r', 'OnePlus 12R 8GB/128GB', 'phone', 'OnePlus', 36500, 39999, $ph('12R', '8GB / 128GB', 'Iron Gray', '1002', 1));
            $P('px8a', 'Google Pixel 8a 8GB/128GB', 'phone', 'Google', 44000, 49999, $ph('Pixel 8a', '8GB / 128GB', 'Obsidian', '1002', 1));
            $P('vivo', 'Vivo V30 5G 8GB/256GB', 'phone', 'Vivo', 30500, 33999, $ph('V30', '8GB / 256GB', 'Peacock Green', '1001'));
            $P('reno', 'Oppo Reno 11 5G 8GB/256GB', 'phone', 'Oppo', 27000, 29999, $ph('Reno 11', '8GB / 256GB', 'Wave Green', '1001'));
            $P('realme', 'Realme 12 Pro+ 5G 8GB/256GB', 'phone', 'Realme', 26000, 29999, $ph('12 Pro+', '8GB / 256GB', 'Navigator Beige', '1001', 1));
            $P('s22u', 'Samsung Galaxy S22 128GB (Used)', 'phone', 'Samsung', 24000, 28999, $ph('Galaxy S22', '8GB / 128GB', 'Phantom Black', '1005', 0, ['condition' => 'used', 'warranty_months' => 3, 'warranty_provider' => 'Shop']));
            $P('gw6', 'Samsung Galaxy Watch6 44mm', 'watch', 'Samsung', 22000, 26999, ['model' => 'Galaxy Watch6', 'color' => 'Graphite', 'tracking' => 'serial', 'supplier_id' => $this->s['1001']->id, 'min_stock' => 1]);
            $P('aws', 'Apple Watch SE (2nd Gen) 44mm', 'watch', 'Apple', 24500, 27900, ['model' => 'Watch SE 2', 'color' => 'Midnight', 'tracking' => 'serial', 'supplier_id' => $this->s['1002']->id, 'min_stock' => 1]);
            $acc = fn ($sku, $min, $o = []) => $o + ['sku' => $sku, 'supplier_id' => $this->s['1003']->id, 'min_stock' => $min];
            $P('ad20', 'Apple 20W USB-C Power Adapter', 'charge', 'Apple', 1100, 1900, $acc('ACC-APL-20W', 8));
            $P('sm25', 'Samsung 25W Super Fast Charger', 'charge', 'Samsung', 1000, 1699, $acc('ACC-SAM-25W', 6));
            $P('ccab', 'VoltX USB-C to USB-C Braided Cable 1m', 'charge', 'VoltX', 180, 499, $acc('ACC-VX-CC1M', 15, ['warranty_months' => 0]));
            $P('lcab', 'VoltX Lightning to USB-C Cable 1m', 'charge', 'VoltX', 220, 599, $acc('ACC-VX-LC1M', 10, ['warranty_months' => 0]));
            $P('buds', 'Nexa Buds Pro ANC Wireless Earbuds', 'audio', 'Nexa', 1800, 3499, $acc('AUD-NX-BUDSPRO', 5));
            $P('wired', 'Nexa Wired Earphones 3.5mm', 'audio', 'Nexa', 150, 399, $acc('AUD-NX-WIRED', 10, ['warranty_months' => 0]));
            $P('pb10', 'VoltX 10000mAh 22.5W Power Bank', 'power', 'VoltX', 1300, 2499, $acc('PWR-VX-10K', 5));
            $P('pb20', 'VoltX 20000mAh PD Power Bank', 'power', 'VoltX', 2100, 3799, $acc('PWR-VX-20K', 5));
            $P('case15', 'Silicone Case – iPhone 15', 'case', 'Generic', 250, 899, $acc('CAS-IP15-SIL', 8));
            $P('glass', 'Tempered Glass Screen Guard (6.1"–6.7")', 'case', 'Generic', 40, 299, $acc('CAS-TG-UNI', 30));
            $P('cases24', 'Clear Shockproof Case – Galaxy S24', 'case', 'Generic', 200, 699, $acc('CAS-S24-CLR', 5));
            $P('car', 'VoltX Dual-Port 36W Car Charger', 'charge', 'VoltX', 450, 999, $acc('ACC-VX-CAR36', 4));
            $P('spk', 'Nexa Boom Mini Bluetooth Speaker', 'audio', 'Nexa', 1500, 2799, $acc('AUD-NX-BOOM', 3));
            $part = fn ($sku, $min, $days) => ['sku' => $sku, 'supplier_id' => $this->s['1004']->id, 'min_stock' => $min, 'repair_warranty_days' => $days];
            $P('pOled13', 'iPhone 13 OLED Display Assembly', 'parts', 'Apple (compatible)', 6500, 9500, $part('SPR-IP13-OLED', 2, 90));
            $P('pBat12', 'iPhone 12 Battery (High Capacity)', 'parts', 'Apple (compatible)', 1400, 2800, $part('SPR-IP12-BAT', 3, 180));
            $P('pBatA', 'Samsung A-Series Battery (A15/A25)', 'parts', 'Samsung (compatible)', 900, 1900, $part('SPR-SAMA-BAT', 3, 180));
            $P('pPort', 'Type-C Charging Port Flex (Universal)', 'parts', 'Generic', 300, 900, $part('SPR-TC-PORT', 4, 60));
            $P('pRnDisp', 'Redmi Note 13 Pro AMOLED Display', 'parts', 'Xiaomi (compatible)', 4200, 6500, $part('SPR-RN13P-DSP', 2, 90));
            $P('pBack', 'iPhone Back Glass (13/14)', 'parts', 'Generic', 700, 2200, $part('SPR-IP-BACK', 2, 30));
            $P('pSpk', 'Loudspeaker Module (Universal)', 'parts', 'Generic', 250, 800, $part('SPR-SPK-UNI', 4, 60));
            $P('pS21', 'Galaxy S21 AMOLED Display', 'parts', 'Samsung (compatible)', 11800, 16500, $part('SPR-S21-DSP', 1, 90));
        });

        $custs = [['Ishara Fernando', '077 245 1180', 'ishara.f@mail.example', '12 Lake Road'], ['Mohamed Rizwan', '071 556 2093', '', '45/2 Station Avenue'],
            ['Sanjana Kumari', '076 889 4410', 'sanjana.k@mail.example', '7 Temple Lane'], ['Arjun Patel', '070 312 7765', 'arjun.p@mail.example', '102 Hill Street'],
            ['Fatima Zahra', '075 640 2218', '', '3 Garden Close'], ['Chen Wei', '078 901 3344', 'chen.wei@mail.example', '88 Harbour View Apts'],
            ['Lakshmi Raman', '077 118 9052', '', '21 Market Road'], ['David Thomas', '071 774 6630', 'd.thomas@mail.example', '5 Church Street'],
            ['Nadia Hussain', '076 205 8891', 'nadia.h@mail.example', '19 Palm Grove'], ['Kasun Jayawardena', '070 667 1423', '', '60 New Town'],
            ['Emily Johnson', '075 330 7718', 'emily.j@mail.example', '14 Park Avenue'], ['Ravi Shankar', '078 452 0096', '', '9 River Side'],
            ['Amaya de Silva', '077 993 2475', 'amaya.ds@mail.example', '33 Flower Road'], ['Omar Farooq', '071 118 6650', '', '2 Mosque Lane'],
            ['Grace Williams', '076 541 0039', 'grace.w@mail.example', '77 Sunset Blvd'], ['Nuwan Bandara', '070 284 5562', '', '18 Kandy Road']];
        foreach ($custs as $i => [$name, $phone, $email, $address]) {
            $this->c[$i] = $this->as('sales', $this->at(400 - $i * 20, 11), fn () => CatalogService::saveCustomer(['name' => $name, 'phone' => $phone, 'email' => $email ?: null, 'address' => $address,
                'notes' => $i === 3 ? 'Prefers WhatsApp updates. Corporate buyer for his office.' : ($i === 7 ? 'VIP — offer extended warranty on high-end phones.' : null)]));
        }
    }

    private function purchase(int $daysAgo, string $sup, array $lines, float $paidRatio = 1): Purchase
    {
        return $this->as('store', $this->at($daysAgo, 11, $this->rint(0, 50)), function () use ($daysAgo, $sup, $lines, $paidRatio) {
            $items = [];
            foreach ($lines as $l) {
                [$key, $qty] = $l;
                $p = $this->p[$key]->fresh();
                $items[] = ['product_id' => $p->id, 'qty' => $qty, 'cost' => $l[2] ?? $p->cost, 'condition' => $l[3] ?? $p->condition, 'units' => $p->tracking !== 'qty' ? $this->units($p, $qty) : null];
            }
            $total = array_sum(array_map(fn ($i) => $i['qty'] * $i['cost'], $items));

            return PurchaseService::save(['supplier_id' => $this->s[$sup]->id, 'status' => 'received', 'supplier_invoice' => 'SI'.$sup.'-'.$this->rint(10000, 99999),
                'date' => $this->at($daysAgo)->toDateString(), 'items' => $items, 'paid' => round($total * $paidRatio), 'method' => 'Bank Transfer']);
        });
    }

    private function method(): string
    {
        $x = mt_rand() / mt_getrandmax();

        return $x < 0.5 ? 'Cash' : ($x < 0.8 ? 'Card' : ($x < 0.9 ? 'Bank Transfer' : 'Mobile Wallet'));
    }

    private function sale(int $daysAgo, string $user, ?Customer $cust, array $lines, array $o = []): ?Sale
    {
        $when = $o['at'] ?? $this->at($daysAgo, $o['hour'] ?? $this->rint(9, 19), $this->rint(0, 59));

        return $this->as($user, $when, function () use ($cust, $lines, $o) {
            $taken = [];
            $items = [];
            foreach ($lines as $l) {
                $p = $this->p[$l[0]]->fresh();
                if ($p->tracking !== 'qty') {
                    $d = Device::where('product_id', $p->id)->where('status', 'in_stock')->whereNotIn('id', $taken)->orderBy('id')->first();
                    if (! $d) {
                        continue;
                    }
                    $taken[] = $d->id;
                    $items[] = ['product_id' => $p->id, 'device_id' => $d->id, 'qty' => 1, 'price' => $p->price, 'warranty_months' => $d->condition === 'new' ? $p->warranty_months : $p->used_warranty_months];
                } else {
                    $items[] = ['product_id' => $p->id, 'qty' => $l[1] ?? 1, 'price' => $p->price];
                }
            }
            if (! $items) {
                return null;
            }
            $tmp = $items;
            $total = \App\Services\Totals::cart($tmp, $o['discount'] ?? 0)['total'];
            $pays = match (true) {
                isset($o['partial']) => [['method' => 'Cash', 'amount' => round($total * $o['partial'])]],
                ! empty($o['split']) => [['method' => 'Card', 'amount' => round($total * 0.6)], ['method' => 'Cash', 'amount' => $total - round($total * 0.6)]],
                default => [['method' => $o['method'] ?? $this->method(), 'amount' => $total]],
            };

            return SaleService::create(['customer_id' => $cust?->id, 'items' => $items, 'discount' => $o['discount'] ?? 0, 'payments' => $pays, 'allow_credit' => isset($o['partial'])]);
        });
    }

    /* ---------------- 14 months of trading ---------------- */

    private function trading(): void
    {
        $C = $this->c;
        $this->purchase(430, '1001', [['s24', 5], ['a15', 6], ['redmi', 4], ['vivo', 3], ['gw6', 2]]);
        $this->purchase(429, '1002', [['ip15', 4], ['op12r', 2], ['px8a', 2], ['aws', 2]]);
        $this->purchase(428, '1003', [['ad20', 25], ['sm25', 22], ['ccab', 60], ['lcab', 25], ['buds', 12], ['wired', 16], ['pb10', 14], ['pb20', 12], ['case15', 24], ['glass', 80], ['cases24', 25], ['car', 12], ['spk', 8]]);
        $this->purchase(428, '1004', [['pOled13', 4], ['pBat12', 6], ['pBatA', 8], ['pPort', 10], ['pRnDisp', 2], ['pBack', 4], ['pSpk', 10]]);

        // older phone sales → warranties now expired / expiring / active
        foreach ([[395, 's24', 0], [380, 'ip15', 1], [372, 'a15', 2], [366, 'redmi', 3], [352, 's24', 4], [346, 'vivo', 5], [341, 'gw6', 6], [335, 'ip15', 7],
            [300, 'op12r', 8], [270, 'a15', 9], [240, 'px8a', 10], [205, 'ip15', 11], [200, 'a15', 12], [180, 'aws', 13]] as $i => [$d, $p, $c]) {
            $this->sale($d, $i % 2 ? 'sales' : 'manager', $C[$c], array_merge([[$p], ['glass']], $i % 3 === 0 ? [['cases24']] : []), ['split' => $i % 4 === 1]);
        }
        $this->purchase(150, '1001', [['s24', 3], ['a15', 6], ['redmi', 4], ['vivo', 2], ['reno', 3], ['realme', 2]]);
        $this->purchase(148, '1002', [['ip15', 4], ['px8a', 2], ['op12r', 2]]);
        $this->purchase(146, '1005', [['ip13r', 4, 34000, 'refurbished'], ['s22u', 2, 24000, 'used']]);
        $this->purchase(120, '1003', [['ad20', 15], ['buds', 6], ['pb10', 6], ['glass', 50], ['case15', 12], ['wired', 10], ['sm25', 10]]);

        foreach ([[140, 's24', 14], [128, 'a15', 15], [120, 's24', 3], [112, 'redmi', 0], [104, 'reno', 1], [97, 'ip13r', 2], [95, 'realme', 4],
            [92, 'a15', 5], [88, 'vivo', 6], [80, 'ip15', 9], [76, 'realme', 10], [70, 's22u', 11], [64, 'px8a', 12], [60, 'redmi', 13]] as $i => [$d, $p, $c]) {
            $apple = str_starts_with($p, 'ip');
            $discount = $i % 4 === 0 ? 1000 : 0;
            $this->sale($d, $discount ? 'manager' : ['sales', 'ayesha', 'manager'][$i % 3], $C[$c], array_merge([[$p], ['glass']], $apple ? [['case15'], ['ad20']] : []),
                array_filter(['split' => $i % 5 === 2, 'partial' => $i === 6 ? 0.7 : null, 'discount' => $discount]));
        }
        $this->purchase(45, '1001', [['s24', 2], ['a15', 3], ['redmi', 2], ['vivo', 2]], 0.5);
        $this->purchase(40, '1002', [['ip15', 2], ['op12r', 1], ['aws', 1]], 0.6);
        $this->purchase(15, '1004', [['pOled13', 3], ['pBat12', 4], ['pBatA', 4], ['pPort', 6], ['pBack', 3], ['pSpk', 4]]);
        $this->purchase(12, '1003', [['ccab', 40], ['glass', 40], ['pb10', 6], ['buds', 6], ['lcab', 4]], 0);

        // daily trading over the last 8 weeks
        $pool = ['glass' => 10, 'ccab' => 8, 'case15' => 4, 'cases24' => 3, 'ad20' => 4, 'sm25' => 3, 'buds' => 3, 'wired' => 6, 'pb10' => 3, 'pb20' => 3, 'lcab' => 5, 'car' => 1, 'spk' => 1];
        $floors = ['glass' => 45, 'ccab' => 30, 'case15' => 12, 'cases24' => 6, 'ad20' => 10, 'sm25' => 9, 'buds' => 8, 'wired' => 0, 'pb10' => 7, 'pb20' => 3, 'lcab' => 4, 'car' => 6, 'spk' => 4];
        $phoneFloors = ['s24' => 3, 'a15' => 4, 'ip15' => 3, 'ip13r' => 2, 'redmi' => 3, 'op12r' => 2, 'px8a' => 1, 'vivo' => 2, 'reno' => 2, 'gw6' => 1, 'aws' => 1];
        $weighted = function () use ($pool) {
            $r = mt_rand(1, array_sum($pool));
            foreach ($pool as $k => $w) {
                if (($r -= $w) <= 0) {
                    return $k;
                }
            }

            return 'glass';
        };
        for ($d = 56; $d >= 0; $d--) {
            $n = $d === 0 ? 3 : $this->rint(1, 4) + ($this->at($d)->isSaturday() ? 2 : 0);
            for ($k = 0; $k < $n; $k++) {
                $lines = [];
                for ($j = 0, $want = $this->rint(1, 3); $j < $want; $j++) {
                    $key = $weighted();
                    if ($this->p[$key]->fresh()->qty - 1 >= $floors[$key] && ! in_array($key, array_column($lines, 0), true)) {
                        $lines[] = [$key, in_array($key, ['glass', 'ccab']) ? $this->rint(1, 2) : 1];
                    }
                }
                $cust = null;
                if (mt_rand(1, 100) <= 22) {
                    $pk = array_rand($phoneFloors);
                    if (Inventory::stockOf($this->p[$pk]->fresh()) > $phoneFloors[$pk]) {
                        array_unshift($lines, [$pk]);
                        $cust = $this->pick($C);
                    }
                }
                if (! $lines) {
                    continue;
                }
                if (! $cust && mt_rand(1, 100) <= 15) {
                    $cust = $this->pick($C);
                }
                $when = $d === 0 ? $this->realNow->copy()->subMinutes(($n - $k) * 40) : null;
                $this->sale($d, $this->pick(['sales', 'sales', 'ayesha', 'manager']), $cust, $lines, array_filter(['at' => $when, 'partial' => $cust && mt_rand(1, 100) <= 8 ? 0.5 : null]));
            }
        }
        $this->sale(12, 'manager', $C[3], [['a15'], ['a15'], ['glass', 2]], ['partial' => 0.4, 'hour' => 15]);

        // open purchase order (demo: receive it with bulk IMEI scan)
        $this->as('store', $this->at(2, 12), fn () => PurchaseService::save(['supplier_id' => $this->s['1001']->id, 'status' => 'ordered', 'date' => $this->at(2)->toDateString(),
            'expected_date' => $this->realNow->copy()->addDays(2)->toDateString(), 'note' => 'Restock fast movers before weekend promotion.',
            'items' => [['product_id' => $this->p['realme']->id, 'qty' => 2, 'cost' => 26000], ['product_id' => $this->p['reno']->id, 'qty' => 2, 'cost' => 27000]]]));
    }

    /* ---------------- repairs, claims & replacement ---------------- */

    private function repair(array $s): Repair
    {
        $recv = $this->at($s['d'], $s['hour'] ?? 10, $this->rint(0, 50));
        $step = 0;
        $tick = function () use ($recv, &$step, $s) {
            return $recv->copy()->addMinutes((int) (++$step * ($s['stepH'] ?? 2.5) * 60));
        };
        $tech = $s['tech'] ?? 'tech';
        $r = $this->as($s['by'] ?? $this->pick(['sales', 'ayesha', 'manager']), $recv, fn () => RepairService::create([
            'customer_id' => $s['c']->id, 'brand' => $s['brand'], 'model' => $s['model'], 'color' => $s['color'] ?? null, 'imei' => $this->imei($s['brand']),
            'type' => $s['type'], 'condition' => $s['cond'] ?? 'Minor scratches on frame. Screen intact.', 'accessories' => $s['acc'] ?? ['SIM tray'],
            'problem' => $s['problem'], 'existing_damage' => $s['damage'] ?? null, 'estimate' => $s['estimate'] ?? 0,
            'estimate_approved' => $s['target'] !== 'awaiting_approval' && empty($s['rejected']) && ($s['estimate'] ?? 0) > 0,
            'expected_date' => $recv->copy()->addDays($s['eta'] ?? 3)->toDateString(), 'terms_accepted' => true, 'advance' => $s['advance'] ?? 0, 'priority' => $s['priority'] ?? 'Normal',
        ]));
        if ($s['target'] === 'received') {
            return $r;
        }
        $this->as('manager', $tick(), fn () => RepairService::update($r, ['technician_id' => $this->u[$tech]->id]));
        $stopAt = $s['target'] === 'delivered' ? 'ready' : $s['target'];
        foreach (['inspection', 'diagnosed', 'awaiting_approval', 'awaiting_parts', 'in_progress', 'completed', 'qc', 'ready'] as $st) {
            if ($st === 'awaiting_approval' && empty($s['needApproval']) && $s['target'] !== 'awaiting_approval') {
                continue;
            }
            if ($st === 'awaiting_parts' && empty($s['waitParts']) && $s['target'] !== 'awaiting_parts') {
                continue;
            }
            if ($st === 'diagnosed') {
                $this->as($tech, $tick(), fn () => RepairService::update($r, ['diagnosis' => $s['diagnosis'] ?? 'Fault confirmed on inspection.', 'labor' => $s['labor'] ?? 0], 'Diagnosis recorded'));
            }
            if ($st === 'in_progress') {
                if ($r->fresh()->approval_status !== 'approved') {
                    $this->as($tech, $tick(), fn () => RepairService::approval($r, true, 'Customer approved by phone', (float) ($s['estimate'] ?? $s['labor'] ?? 0)));
                }
                foreach ($s['parts'] ?? [] as [$pk, $q]) {
                    $this->as($tech, $tick(), fn () => RepairService::addPart($r, $this->p[$pk]->id, $q, null, false));
                }
            }
            if (! empty($s['rejected']) && $st === 'awaiting_approval') {
                $this->as($tech, $tick(), fn () => RepairService::setStatus($r, $st));
                $this->as($tech, $tick(), fn () => RepairService::approval($r, false, 'Customer declined — too expensive'));
                $this->as('manager', $tick(), fn () => RepairService::cancel($r, 'Customer declined the estimate; device returned unrepaired.'));

                return $r;
            }
            $this->as($tech, $tick(), fn () => RepairService::setStatus($r, $st));
            if ($st === $stopAt) {
                break;
            }
        }
        if ($s['target'] === 'delivered') {
            $this->as(! empty($s['unpaid']) ? 'manager' : 'sales', $this->at($s['dd'], 16, $this->rint(0, 50)), fn () => RepairService::deliver($r, [
                'collected_by' => $s['c']->name, 'confirm' => true, 'signature' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                'payment' => ! empty($s['unpaid']) ? 0 : Totals::repair($r->fresh())['balance'], 'method' => $this->method(), 'credit' => ! empty($s['unpaid']),
            ]));
        }

        return $r->fresh();
    }

    private function repairsAndClaims(): void
    {
        $C = $this->c;
        $R = [];
        $R['ip13'] = $this->repair(['d' => 78, 'dd' => 75, 'c' => $C[2], 'brand' => 'Apple', 'model' => 'iPhone 13', 'color' => 'Blue', 'type' => 'Screen replacement', 'problem' => 'Screen cracked after drop, touch not responding in lower half.', 'damage' => 'Cracked display, dent on bottom-left corner', 'estimate' => 11000, 'labor' => 1500, 'parts' => [['pOled13', 1]], 'diagnosis' => 'Display assembly damaged. Replaced OLED, tested Face ID, True Tone OK.', 'target' => 'delivered']);
        $R['a15bat'] = $this->repair(['d' => 205, 'dd' => 203, 'c' => $C[9], 'brand' => 'Samsung', 'model' => 'Galaxy A15', 'type' => 'Battery replacement', 'problem' => 'Battery drains within 4 hours, phone heats up.', 'estimate' => 2900, 'labor' => 1000, 'parts' => [['pBatA', 1]], 'diagnosis' => 'Battery swollen. Replaced battery and cleaned contacts.', 'target' => 'delivered', 'tech' => 'nimal']);
        $R['rnport'] = $this->repair(['d' => 7, 'dd' => 5, 'c' => $C[0], 'brand' => 'Xiaomi', 'model' => 'Redmi Note 13 Pro', 'type' => 'Charging port repair', 'problem' => 'Phone charges only at certain angle.', 'estimate' => 2400, 'labor' => 1500, 'parts' => [['pPort', 1]], 'diagnosis' => 'Charging port worn. Replaced Type-C flex.', 'target' => 'delivered']);
        $R['ip12bat'] = $this->repair(['d' => 42, 'dd' => 40, 'c' => $C[6], 'brand' => 'Apple', 'model' => 'iPhone 12', 'color' => 'White', 'type' => 'Battery replacement', 'problem' => 'Battery health 71%, shuts down at 20%.', 'estimate' => 4300, 'labor' => 1500, 'parts' => [['pBat12', 1]], 'diagnosis' => 'Replaced battery. Calibrated and tested.', 'target' => 'delivered', 'tech' => 'nimal']);
        $R['saport'] = $this->repair(['d' => 52, 'dd' => 50, 'c' => $C[12], 'brand' => 'Samsung', 'model' => 'Galaxy A25', 'type' => 'Charging port repair', 'problem' => 'Not charging, cable loose.', 'estimate' => 2400, 'labor' => 1500, 'parts' => [['pPort', 1]], 'diagnosis' => 'Port pins bent. Replaced charging port.', 'target' => 'delivered', 'unpaid' => true]);
        $this->repair(['d' => 3, 'c' => $C[10], 'brand' => 'Google', 'model' => 'Pixel 7', 'type' => 'Software / flashing', 'problem' => 'Stuck on boot logo after update.', 'estimate' => 2500, 'labor' => 2500, 'diagnosis' => 'Re-flashed factory image, data could not be recovered (customer informed).', 'target' => 'ready']);
        $this->repair(['d' => 4, 'c' => $C[7], 'brand' => 'Apple', 'model' => 'iPhone 14', 'color' => 'Purple', 'type' => 'Back glass replacement', 'problem' => 'Back glass shattered.', 'estimate' => 5200, 'labor' => 3000, 'parts' => [['pBack', 1]], 'diagnosis' => 'Laser removed back glass, fitted new panel.', 'target' => 'ready', 'tech' => 'nimal', 'advance' => 5200]);
        $this->repair(['d' => 2, 'c' => $C[5], 'brand' => 'Vivo', 'model' => 'V27', 'type' => 'Speaker / mic repair', 'problem' => 'Low volume on calls and media.', 'estimate' => 1800, 'labor' => 1000, 'parts' => [['pSpk', 1]], 'diagnosis' => 'Loudspeaker membrane damaged; replacing module.', 'target' => 'in_progress']);
        $this->repair(['d' => 1, 'c' => $C[13], 'brand' => 'Oppo', 'model' => 'A78', 'type' => 'Water damage service', 'problem' => 'Dropped in water, no display.', 'cond' => 'Water indicator triggered. Corrosion visible near SIM slot.', 'estimate' => 4500, 'labor' => 4500, 'diagnosis' => 'Corrosion on board near PMIC. Ultrasonic cleaning + possible IC replacement.', 'target' => 'awaiting_approval', 'tech' => 'nimal', 'needApproval' => true, 'priority' => 'High']);
        $this->repair(['d' => 5, 'c' => $C[8], 'brand' => 'Samsung', 'model' => 'Galaxy S21', 'type' => 'Screen replacement', 'problem' => 'Green lines on display after drop.', 'estimate' => 19000, 'labor' => 2500, 'diagnosis' => 'Display panel failure. Part ordered from SparePoint.', 'target' => 'awaiting_parts', 'waitParts' => true, 'eta' => 6]);
        $this->repair(['d' => 0, 'hour' => 9, 'c' => $C[15], 'brand' => 'OnePlus', 'model' => 'Nord CE 3', 'type' => 'Camera repair', 'problem' => 'Rear camera blurry, cannot focus.', 'target' => 'inspection', 'tech' => 'nimal', 'eta' => 2]);
        $this->repair(['d' => 0, 'hour' => 11, 'c' => $C[4], 'brand' => 'Realme', 'model' => '11 Pro', 'type' => 'General service', 'problem' => 'Phone restarts randomly.', 'target' => 'received', 'eta' => 2, 'acc' => ['SIM tray', 'Back cover']]);
        $this->repair(['d' => 6, 'c' => $C[1], 'brand' => 'Apple', 'model' => 'iPhone 11', 'type' => 'Motherboard repair', 'problem' => 'No service / searching network.', 'estimate' => 8500, 'labor' => 8500, 'diagnosis' => 'Baseband IC fault — requires board-level repair.', 'target' => 'diagnosed', 'eta' => 4, 'priority' => 'High']);
        $this->repair(['d' => 2, 'c' => $C[11], 'brand' => 'Xiaomi', 'model' => 'Redmi 12', 'type' => 'Charging port repair', 'problem' => 'Not charging.', 'estimate' => 2400, 'labor' => 1500, 'parts' => [['pPort', 1]], 'diagnosis' => 'Replaced charging port, testing charge cycles.', 'target' => 'qc', 'tech' => 'nimal']);
        $this->repair(['d' => 9, 'c' => $C[14], 'brand' => 'Samsung', 'model' => 'Galaxy A54', 'type' => 'Screen replacement', 'problem' => 'Display cracked.', 'estimate' => 14500, 'labor' => 2500, 'diagnosis' => 'Display + frame damage.', 'target' => 'awaiting_approval', 'rejected' => true, 'needApproval' => true]);

        $wFor = fn ($pk, Customer $c) => Warranty::where('kind', 'product')->where('product_id', $this->p[$pk]->id)->where('customer_id', $c->id)->where('status', 'active')->first();
        $claim = fn ($user, $days, $hour, $w, $fault, $notes = null, $flags = []) => $this->as($user, $this->at($days, $hour), fn () => WarrantyService::createClaim(['warranty_id' => $w->id, 'fault' => $fault, 'notes' => $notes, 'flags' => $flags]));
        $upd = fn ($days, $hour, Claim $c, $patch) => $this->as('manager', $this->at($days, $hour), fn () => WarrantyService::updateClaim($c->fresh(), $patch));

        if ($w = $wFor('s24', $C[3])) {
            $claim('sales', 1, 15, $w, 'Display flickers at low brightness; green tint after 10 minutes of use.', 'Customer has invoice and box.');
        }
        if ($w = $wFor('ip15', $C[9])) {
            $c2 = $claim('ayesha', 8, 12, $w, 'Face ID not working ("Face ID is not available").', 'No physical damage visible.');
            $upd(7, 10, $c2, ['status' => 'inspection', 'assigned_to' => $this->u['tech']->id, 'findings' => 'TrueDepth module not detected. No liquid indicators triggered. Seals intact.']);
            $upd(7, 12, $c2, ['status' => 'approved', 'decision_note' => 'Manufacturing defect confirmed — covered under manufacturer warranty.']);
            $rr = $this->as('manager', $this->at(7, 13), fn () => WarrantyService::claimToRepair($c2->fresh()));
            $this->as('manager', $this->at(7, 14), fn () => RepairService::update($rr, ['technician_id' => $this->u['tech']->id, 'diagnosis' => 'Sent TrueDepth module request to distributor; awaiting replacement under warranty.']));
            $this->as('tech', $this->at(6, 10), fn () => RepairService::setStatus($rr->fresh(), 'awaiting_parts', 'Waiting for distributor replacement part'));
        }
        if ($w = ($wFor('redmi', $C[13]) ?? $wFor('redmi', $C[0]))) {
            $c3 = $claim('sales', 15, 11, $w, 'Phone not powering on.');
            $upd(14, 10, $c3, ['status' => 'inspection', 'assigned_to' => $this->u['nimal']->id, 'findings' => 'Liquid damage indicator RED. Corrosion on charging board.', 'flags' => ['liquid' => true]]);
            $upd(14, 12, $c3, ['status' => 'rejected', 'decision_note' => 'Liquid damage — excluded by warranty terms. Offered paid repair quote.']);
        }
        if ($w = Warranty::where('kind', 'product')->where('product_id', $this->p['buds']->id)->whereNotNull('customer_id')->where('status', 'active')->first()) {
            $c4 = $claim('ayesha', 10, 13, $w, 'Left earbud not charging in case.');
            $upd(10, 15, $c4, ['status' => 'approved', 'decision_note' => 'Charging contact defect confirmed.', 'findings' => 'Left bud does not register in case.']);
            $upd(9, 11, $c4, ['status' => 'resolved', 'resolution' => 'replacement', 'resolution_note' => 'Replaced with new unit from distributor stock (RMA #TL-5520).', 'cost' => 1800]);
        }
        if ($w = Warranty::where('repair_id', $R['ip12bat']->id)->first()) {
            $claim('sales', 0, 10, $w, 'Battery draining fast again, 1 month after replacement.', 'Customer reports 60% drain overnight.');
        }
        if ($w = Warranty::where('repair_id', $R['saport']->id)->first()) {
            $c6 = $claim('ayesha', 30, 11, $w, 'Charging port loose again.');
            $upd(30, 14, $c6, ['status' => 'approved', 'findings' => 'Replaced port solder joint cracked.', 'decision_note' => 'Within 60-day parts warranty — free repair.']);
            $fr = $this->as('manager', $this->at(30, 15), fn () => WarrantyService::claimToRepair($c6->fresh()));
            $this->as('tech', $this->at(29, 10), function () use ($fr) {
                RepairService::update($fr, ['diagnosis' => 'Re-soldered and replaced port flex under warranty.']);
                RepairService::addPart($fr, $this->p['pPort']->id, 1, null, true);
                RepairService::setStatus($fr->fresh(), 'in_progress');
            });
            $this->as('tech', $this->at(29, 14), function () use ($fr) {
                foreach (['completed', 'qc', 'ready'] as $st) {
                    RepairService::setStatus($fr->fresh(), $st);
                }
            });
            $this->as('sales', $this->at(28, 12), fn () => RepairService::deliver($fr->fresh(), ['collected_by' => $this->c[12]->name, 'confirm' => true, 'signature' => 'data:image/png;base64,iVBORw0KGgo=', 'payment' => 0]));
            $upd(28, 13, $c6, ['status' => 'resolved', 'resolution' => 'repair', 'resolution_note' => "Free warranty repair {$fr->no} completed.", 'cost' => 300]);
        }
        // Client requirement: defective phone replaced with a new unit — both IMEIs linked
        $wA15 = Warranty::where('kind', 'product')->where('product_id', $this->p['a15']->id)->where('status', 'active')->whereNotNull('customer_id')
            ->where('start_date', '>=', $this->at(150)->toDateString())->orderBy('id')->first();
        if ($wA15) {
            $c7 = $claim('sales', 4, 11, $wA15, 'Phone restarts in a loop, will not boot past logo.', 'Customer has box and invoice. No physical damage.');
            $upd(4, 13, $c7, ['status' => 'inspection', 'assigned_to' => $this->u['tech']->id, 'findings' => 'Board failure confirmed (eMMC). No liquid or impact damage. Seals intact.']);
            $upd(3, 10, $c7, ['status' => 'approved', 'decision_note' => 'Manufacturing defect within warranty — replace unit.']);
            $new = Device::where('product_id', $this->p['a15']->id)->where('status', 'in_stock')->orderByDesc('id')->first();
            $this->as('manager', $this->at(3, 11), fn () => WarrantyService::replace($c7->fresh(), $new->id, 'remaining', 'Defective unit to be sent to Metro Mobile Distributors for RMA.'));
        }
    }

    /* ---------------- quotations, returns, adjustments, expenses ---------------- */

    private function misc(): void
    {
        $C = $this->c;
        $this->as('sales', $this->at(1, 16), fn () => SaleService::quote(['customer_id' => $C[3]->id, 'discount' => 0, 'note' => 'Corporate quote for 3 office phones.', 'items' => [
            ['product_id' => $this->p['ip15']->id, 'qty' => 3, 'price' => 72990], ['product_id' => $this->p['case15']->id, 'qty' => 3, 'price' => 899]]]));
        $this->as('ayesha', $this->at(0, 12), fn () => SaleService::quote(['customer_id' => $C[10]->id, 'items' => [
            ['product_id' => $this->p['px8a']->id, 'qty' => 1, 'price' => 49999], ['product_id' => $this->p['buds']->id, 'qty' => 1, 'price' => 3499]]]));

        $ret = Sale::whereHas('items', fn ($q) => $q->where('product_id', $this->p['pb10']->id))->where('status', 'completed')
            ->whereDate('date', '>=', $this->at(20)->toDateString())->whereDate('date', '<=', $this->at(6)->toDateString())->first();
        if ($ret) {
            $item = $ret->items()->where('product_id', $this->p['pb10']->id)->first();
            $this->as('manager', Carbon::parse($ret->created_at)->addDays(2)->setTime(14, 0), fn () => SaleService::refund($ret, [['item_id' => $item->id, 'qty' => 1]], 'Power bank not holding charge — returned within 7 days.', 'damaged', 'Cash'));
        }

        $adj = $this->as('store', $this->at(18, 17), fn () => StockService::request(['product_id' => $this->p['glass']->id, 'qty' => -3, 'type' => 'Damaged', 'reason' => 'Cracked during display handling.']));
        $this->as('manager', $this->at(18, 18), fn () => StockService::approve($adj));
        $this->as('store', $this->at(1, 17), fn () => StockService::request(['product_id' => $this->p['pb20']->id, 'qty' => -1, 'type' => 'Missing', 'reason' => 'Stock count shows 1 unit short vs system.']));

        $exp = fn ($d, $cat, $amt, $note, $m = 'Bank Transfer') => $this->as('manager', $this->at($d, 18), fn () => CatalogService::addExpense(['date' => $this->at($d)->toDateString(), 'category' => $cat, 'amount' => $amt, 'note' => $note, 'method' => $m]));
        foreach ([85, 55, 25] as $i => $d) {
            $month = $this->at($d)->format('M');
            $exp($d, 'Rent', 45000, "Shop rent – $month");
            $exp($d - 1, 'Salaries', 168000, "Staff salaries – $month");
            $exp($d - 3, 'Electricity', 7800 + $i * 450, 'Electricity bill', 'Cash');
            $exp($d - 4, 'Internet & Phone', 2490, 'Fibre + landline');
        }
        $exp(40, 'Marketing', 12000, 'Social media ads — festive promo');
        $exp(16, 'Maintenance', 6500, 'AC servicing', 'Cash');
        $exp(9, 'Transport', 1800, 'Courier to distributor (warranty RMA)', 'Cash');
        $exp(3, 'Refreshments', 1450, 'Tea & water for customers', 'Cash');
        $exp(1, 'Bank Charges', 620, 'Card terminal fees');

        $credit = Purchase::where('supplier_id', $this->s['1003']->id)->where('status', 'received')->get()->first(fn ($p) => Totals::purchase($p)['balance'] > 0);
        if ($credit) {
            $this->as('manager', $this->at(10, 12), fn () => PurchaseService::pay($credit, round(Totals::purchase($credit)['balance'] / 2), 'Bank Transfer', 'Part payment'));
        }
    }
}
