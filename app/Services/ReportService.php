<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Claim;
use App\Models\Device;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Repair;
use App\Models\Replacement;
use App\Models\Sale;
use App\Models\SaleReturn;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warranty;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Server-side reports for any date range.
 * Every report returns the same generic structure so the UI, print and Excel export share one renderer:
 *   kpis[] {label, value, format, foot, tone, icon}, chart {title, points[{label, tip, value}]},
 *   sections[] {title, headers[], formats[], rows[][], footer[]}, note
 * Formats: money | int | date | text | pct
 */
class ReportService
{
    private bool $fin;

    private bool $cost;

    public function __construct(private Carbon $from, private Carbon $to)
    {
        $this->fin = Shop::can('reports', 'manage');
        $this->cost = $this->fin || Shop::can('purchases', 'view');
        $this->from = $from->copy()->startOfDay();
        $this->to = $to->copy()->endOfDay();
    }

    private static function kpi(string $label, mixed $value, string $format = 'money', string $foot = '', string $tone = 'blue', string $icon = 'chart'): array
    {
        return compact('label', 'value', 'format', 'foot', 'tone', 'icon');
    }

    private static function section(string $title, array $headers, array $formats, iterable $rows, ?array $footer = null): array
    {
        return ['title' => $title, 'headers' => $headers, 'formats' => $formats, 'rows' => array_values(is_array($rows) ? $rows : collect($rows)->all()), 'footer' => $footer];
    }

    /** Totals from already-loaded relations (avoids one query per invoice). */
    private static function saleNums(Sale $s): array
    {
        $returned = (float) $s->returns->sum('amount');
        $net = Shop::money($s->total - $returned);
        $paid = Shop::money($s->payments->sum('amount'));
        $taxShare = $s->total > 0 ? $s->tax * ($net / $s->total) : 0;
        $cost = $s->items->sum(fn ($i) => $i->cost * ($i->qty - $i->returned_qty));

        return ['net' => $net, 'paid' => $paid, 'balance' => $s->status === 'cancelled' ? 0 : Shop::money($net - $paid), 'profit' => Shop::money($net - $taxShare - $cost), 'tax' => Shop::money($taxShare), 'cost' => $cost];
    }

    private function days(): Collection
    {
        $days = collect();
        for ($d = $this->from->copy(); $d->lte($this->to) && $days->count() < 400; $d->addDay()) {
            $days->push($d->toDateString());
        }

        return $days;
    }

    /* ======================= SALES ======================= */
    public function sales(): array
    {
        $sales = Sale::with(['items.product:id,category_id,brand', 'returns', 'payments', 'user:id,name'])
            ->where('status', '!=', 'cancelled')->whereDate('date', '>=', $this->from->toDateString())->whereDate('date', '<=', $this->to->toDateString())->get();
        $nums = $sales->mapWithKeys(fn ($s) => [$s->id => self::saleNums($s)]);
        $net = $nums->sum('net');
        $refunds = SaleReturn::whereBetween('created_at', [$this->from, $this->to])->with('sale:id,no')->get();
        $cats = Category::pluck('name', 'id');

        $lines = $sales->flatMap(fn ($s) => $s->items->map(function ($i) use ($s) {
            $kept = $i->qty - $i->returned_qty;
            $share = $s->subtotal > 0 ? 1 - $s->discount / $s->subtotal : 1;

            return ['name' => $i->name, 'cat' => $i->product?->category_id, 'brand' => $i->product?->brand ?: '—', 'qty' => $kept,
                'net' => $i->qty ? $i->line_total * $share * ($kept / $i->qty) : 0, 'cost' => $i->cost * $kept];
        }));
        $agg = fn (callable $key) => $lines->groupBy($key)->map(fn ($g, $k) => ['k' => $k, 'qty' => $g->sum('qty'), 'net' => $g->sum('net'), 'margin' => $g->sum('net') - $g->sum('cost')])->sortByDesc('net')->values();
        $row = fn ($x) => $this->fin ? [$x['k'], $x['qty'], $x['net'], $x['margin']] : [$x['k'], $x['qty'], $x['net']];
        $hdr = fn ($first) => $this->fin ? [$first, 'Units', 'Net sales', 'Gross margin'] : [$first, 'Units', 'Net sales'];
        $fmt = $this->fin ? ['text', 'int', 'money', 'money'] : ['text', 'int', 'money'];

        // daily trend (monthly when the range is longer than ~4 months)
        $byDay = $sales->groupBy(fn ($s) => $s->date->toDateString())->map(fn ($g) => $g->sum(fn ($s) => $nums[$s->id]['net']));
        $days = $this->days();
        $points = $days->count() > 124
            ? $days->groupBy(fn ($d) => substr($d, 0, 7))->map(fn ($g, $m) => ['label' => Carbon::parse("$m-01")->format('M y'), 'tip' => Carbon::parse("$m-01")->format('F Y'), 'value' => round($g->sum(fn ($d) => $byDay[$d] ?? 0), 2)])->values()
            : $days->map(fn ($d) => ['label' => (string) Carbon::parse($d)->day, 'tip' => Carbon::parse($d)->format('d M Y'), 'value' => round($byDay[$d] ?? 0, 2)]);

        $pm = $sales->flatMap->payments->where('amount', '>', 0)->groupBy('method')->map(fn ($g, $m) => [$m, $g->count(), $g->sum('amount')])->values();
        $staff = $sales->groupBy('user_id')->map(fn ($g) => [$g->first()->user?->name ?? '—', $g->count(), $g->sum(fn ($s) => $nums[$s->id]['net']), $g->sum(fn ($s) => $nums[$s->id]['net']) / $g->count()])->sortByDesc(2)->values();

        $kpis = [
            self::kpi('Net sales', $net, 'money', $sales->count().' invoices', 'blue', 'receipt'),
            self::kpi('Average invoice', $sales->count() ? $net / $sales->count() : 0, 'money', '', 'cyan', 'chart'),
            self::kpi('Discounts given', $sales->sum(fn ($s) => $s->discount + $s->items->sum('discount')), 'money', '', 'amber', 'tag'),
            self::kpi('Returns & refunds', $refunds->sum('refund'), 'money', $refunds->count().' return(s)', 'red', 'undo'),
            self::kpi('Outstanding', $nums->sum('balance'), 'money', 'Unpaid balance on these invoices', 'purple', 'wallet'),
        ];
        if ($this->fin) {
            $kpis[] = self::kpi('Gross profit', $nums->sum('profit'), 'money', 'Excl. tax, after cost of goods', 'green', 'trendUp');
        }

        return ['kpis' => $kpis, 'chart' => ['title' => 'Sales trend', 'points' => $points], 'sections' => [
            self::section('Sales by category', $hdr('Category'), $fmt, $agg(fn ($l) => $cats[$l['cat']] ?? '—')->map($row)),
            self::section('Sales by brand', $hdr('Brand'), $fmt, $agg(fn ($l) => $l['brand'])->map($row)),
            self::section('Top products', $hdr('Product'), $fmt, $agg(fn ($l) => $l['name'])->take(15)->map($row)),
            self::section('Sales by staff member', ['Staff', 'Invoices', 'Net sales', 'Avg invoice'], ['text', 'int', 'money', 'money'], $staff),
            self::section('Payment methods', ['Method', 'Payments', 'Amount'], ['text', 'int', 'money'], $pm),
            self::section('Returns & refunds', ['Date', 'Invoice', 'Items', 'Reason', 'Refund'], ['date', 'text', 'text', 'text', 'money'],
                $refunds->map(fn ($r) => [$r->created_at->toDateString(), $r->sale?->no, implode(', ', $r->items ?? []), $r->reason, $r->refund])),
        ], 'note' => $this->fin ? 'Gross margin = net sales − cost of goods. Costing: '.Shop::setting('costing') : null];
    }

    /* ======================= INVENTORY ======================= */
    public function inventory(): array
    {
        $products = Product::where('active', true)->get();
        $inStock = Device::where('status', 'in_stock')->selectRaw('product_id, count(*) n, sum(cost) v')->groupBy('product_id')->get()->keyBy('product_id');
        $stock = fn ($p) => $p->tracking === 'qty' ? (int) $p->qty : (int) ($inStock[$p->id]->n ?? 0);
        $value = fn ($p) => $p->tracking === 'qty' ? $p->qty * $p->cost : (float) ($inStock[$p->id]->v ?? 0);
        $moves = StockMovement::whereBetween('created_at', [$this->from, $this->to])->get();
        $held = Device::with('product:id,name')->whereIn('status', ['damaged', 'returned', 'missing', 'warranty_return', 'supplier_return'])->get();

        $kpis = [self::kpi('Units on hand', $products->sum($stock), 'int', $products->count().' active SKUs', 'blue', 'warehouse')];
        if ($this->cost) {
            $kpis[] = self::kpi('Stock valuation (cost)', $products->sum($value), 'money', 'Actual IMEI cost + weighted average', 'purple', 'layers');
        }
        $kpis[] = self::kpi('Stock in (period)', $moves->where('qty', '>', 0)->sum('qty'), 'int', '', 'green', 'trendUp');
        $kpis[] = self::kpi('Stock out (period)', -$moves->where('qty', '<', 0)->sum('qty'), 'int', '', 'amber', 'package');
        $kpis[] = self::kpi('Damaged / returned units', $held->whereIn('status', ['damaged', 'returned', 'missing', 'warranty_return'])->count(), 'int', 'Not sellable', 'red', 'ban');

        $catRows = Category::orderBy('id')->get()->map(function ($c) use ($products, $stock, $value) {
            $ps = $products->where('category_id', $c->id);

            return array_merge([$c->name, $ps->count(), $ps->sum($stock)], $this->cost ? [$ps->sum($value)] : [], [$ps->sum(fn ($p) => $stock($p) * $p->price)]);
        });
        $sections = [
            self::section('Stock valuation by category', array_merge(['Category', 'SKUs', 'Units'], $this->cost ? ['Value (cost)'] : [], ['Retail value']),
                array_merge(['text', 'int', 'int'], $this->cost ? ['money'] : [], ['money']), $catRows,
                array_merge(['Total', $products->count(), $products->sum($stock)], $this->cost ? [$products->sum($value)] : [], [$products->sum(fn ($p) => $stock($p) * $p->price)])),
            self::section('Low & out-of-stock items', ['Product', 'On hand', 'Minimum', 'Status'], ['text', 'int', 'int', 'text'],
                $products->filter(fn ($p) => $stock($p) <= $p->min_stock)->sortBy($stock)->map(fn ($p) => [$p->name, $stock($p), $p->min_stock, $stock($p) <= 0 ? 'Out of stock' : 'Low stock'])),
            self::section('Stock movements by type (period)', ['Type', 'In', 'Out', 'Entries'], ['text', 'int', 'int', 'int'],
                $moves->groupBy('type')->map(fn ($g, $t) => [$t, $g->where('qty', '>', 0)->sum('qty'), -$g->where('qty', '<', 0)->sum('qty'), $g->count()])->sortByDesc(3)->values()),
            self::section('IMEI inventory by product', ['Product', 'In stock', 'Sold', 'Returned / damaged'], ['text', 'int', 'int', 'int'],
                Product::where('tracking', '!=', 'qty')->withCount([
                    'devices as in_stock' => fn ($q) => $q->where('status', 'in_stock'), 'devices as sold' => fn ($q) => $q->where('status', 'sold'),
                    'devices as held' => fn ($q) => $q->whereIn('status', ['returned', 'damaged', 'missing', 'warranty_return', 'supplier_return']),
                ])->get()->map(fn ($p) => [$p->name, $p->in_stock, $p->sold, $p->held])),
        ];
        if (Shop::can('purchases', 'view')) {
            $pur = Purchase::with('items')->where('status', 'received')->whereDate('date', '>=', $this->from->toDateString())->whereDate('date', '<=', $this->to->toDateString())->get();
            $sections[] = self::section('Purchases by supplier (period)', ['Supplier', 'Receipts', 'Units', 'Value', 'Payable now'], ['text', 'int', 'int', 'money', 'money'],
                Supplier::orderBy('name')->get()->map(fn ($s) => [$s->name, $pur->where('supplier_id', $s->id)->count(), $pur->where('supplier_id', $s->id)->sum(fn ($p) => $p->items->sum('qty')),
                    $pur->where('supplier_id', $s->id)->sum('total'), Totals::supplierBalance($s->id)])->filter(fn ($r) => $r[1] || $r[4] > 0)->values());
        }
        $sections[] = self::section('Damaged, returned & RMA units', ['IMEI / serial', 'Product', 'Status', 'Since'], ['text', 'text', 'text', 'date'],
            $held->map(fn ($d) => [$d->code, $d->product?->name, Inventory::label($d->status), $d->updated_at->toDateString()]));

        return ['kpis' => $kpis, 'chart' => null, 'sections' => $sections, 'note' => 'Stock levels are as of now; movements and purchases are for the selected period.'];
    }

    /* ======================= REPAIRS ======================= */
    public function repairs(): array
    {
        $rec = Repair::with(['technician:id,name', 'parts'])->whereBetween('received_at', [$this->from, $this->to])->get();
        $del = Repair::with(['parts', 'payments', 'deliverer:id,name'])->where('status', 'delivered')->whereBetween('delivered_at', [$this->from, $this->to])->get();
        $tot = fn ($r) => Totals::repair($r);
        $tat = $del->count() ? $del->avg(fn ($r) => $r->received_at->diffInHours($r->delivered_at) / 24) : 0;
        $open = Repair::whereNotIn('status', ['delivered', 'cancelled'])->get();
        $overdue = $open->filter(fn ($r) => $r->status !== 'ready' && $r->expected_date && $r->expected_date->lt(today()));

        $kpis = [
            self::kpi('Jobs received', $rec->count(), 'int', '', 'blue', 'wrench'),
            self::kpi('Jobs delivered', $del->count(), 'int', '', 'green', 'handshake'),
            self::kpi('Average turnaround', round($tat, 1), 'days', 'Received → delivered', 'cyan', 'clock'),
            self::kpi('Repair revenue', $del->sum(fn ($r) => $tot($r)['total']), 'money', '', 'purple', 'cash'),
        ];
        if ($this->fin) {
            $kpis[] = self::kpi('Recorded repair costs', $del->sum(fn ($r) => $tot($r)['cost']), 'money', 'Parts + technician cost', 'amber', 'receipt');
        }
        $kpis[] = self::kpi('Open / overdue now', $open->count().' / '.$overdue->count(), 'text', '', 'red', 'alert');

        $byTech = $rec->whereNotNull('technician_id')->groupBy('technician_id')->map(function ($g) use ($tot) {
            $d = $g->where('status', 'delivered');

            return [$g->first()->technician?->name ?? '—', $g->count(), $d->count(), $d->sum(fn ($r) => $tot($r)['total']), $d->count() ? round($d->avg(fn ($r) => $r->received_at->diffInHours($r->delivered_at) / 24), 1) : null];
        })->values();
        $parts = $rec->flatMap->parts->groupBy('name')->map(fn ($g, $n) => [$n, $g->sum('qty'), $g->where('covered', false)->sum(fn ($p) => $p->price * $p->qty), $g->where('covered', true)->sum(fn ($p) => $p->price * $p->qty)])->sortByDesc(1)->values();
        $repeat = Repair::with('parent:id,no')->where(fn ($q) => $q->where('is_warranty_repair', true)->orWhereNotNull('parent_repair_id'))->whereBetween('received_at', [$this->from, $this->to])->get();

        return ['kpis' => $kpis, 'chart' => null, 'sections' => [
            self::section('Jobs by status (received in period)', ['Status', 'Jobs'], ['text', 'int'],
                collect(RepairService::STATUSES)->map(fn ($l, $k) => [$l, $rec->where('status', $k)->count()])->filter(fn ($r) => $r[1])->values()),
            self::section('Repairs by technician', ['Technician', 'Assigned', 'Delivered', 'Revenue', 'Avg days'], ['text', 'int', 'int', 'money', 'text'], $byTech),
            self::section('Parts used in repairs', ['Part', 'Qty', 'Charged', 'Covered by warranty'], ['text', 'int', 'money', 'money'], $parts),
            self::section('Overdue repairs (now)', ['Job', 'Device', 'Due', 'Status'], ['text', 'text', 'date', 'text'],
                $overdue->map(fn ($r) => [$r->no, "{$r->brand} {$r->model}", $r->expected_date->toDateString(), RepairService::STATUSES[$r->status]])),
            self::section('Collection & delivery history', ['Job', 'Delivered', 'Collected by', 'Handed over by', 'Charge'], ['text', 'date', 'text', 'text', 'money'],
                $del->map(fn ($r) => [$r->no, $r->delivered_at->toDateString(), $r->collected_by, $r->deliverer?->name, $tot($r)['total']])),
            self::section('Repeat / warranty repairs', ['Job', 'Original job', 'Device', 'Charge', 'Covered value'], ['text', 'text', 'text', 'money', 'money'],
                $repeat->map(fn ($r) => [$r->no, $r->parent?->no ?? 'Product claim', "{$r->brand} {$r->model}", $tot($r)['total'], $tot($r)['covered_value']])),
        ], 'note' => null];
    }

    /* ======================= WARRANTY ======================= */
    public function warranty(): array
    {
        $all = Warranty::with(['customer:id,name'])->get();
        $state = fn ($kind) => collect(['active' => 'Active', 'expiring' => 'Expiring soon', 'expired' => 'Expired', 'void' => 'Void', 'replaced' => 'Replaced'])
            ->map(fn ($l, $k) => [$l, $all->where('kind', $kind)->filter(fn ($w) => $w->state === $k)->count()])->values();
        $claims = Claim::whereBetween('created_at', [$this->from, $this->to])->get();
        $wr = Repair::with('parts')->where('is_warranty_repair', true)->whereBetween('received_at', [$this->from, $this->to])->get();
        $rpl = Replacement::with('customer:id,name')->whereBetween('created_at', [$this->from, $this->to])->get();

        return ['kpis' => [
            self::kpi('Active product warranties', $all->where('kind', 'product')->filter(fn ($w) => in_array($w->state, ['active', 'expiring']))->count(), 'int', '', 'green', 'shield'),
            self::kpi('Active repair warranties', $all->where('kind', 'repair')->filter(fn ($w) => in_array($w->state, ['active', 'expiring']))->count(), 'int', '', 'green', 'wrench'),
            self::kpi('Claims registered', $claims->count(), 'int', $claims->whereIn('status', ['approved', 'resolved'])->count().' approved · '.$claims->where('status', 'rejected')->count().' rejected', 'purple', 'shieldAlert'),
            self::kpi('Unit replacements', $rpl->count(), 'int', '', 'blue', 'swap'),
            self::kpi('Warranty costs', $claims->where('status', 'resolved')->sum('cost') + $wr->sum(fn ($r) => Totals::repair($r)['covered_value']), 'money', 'Claims + covered repair work', 'amber', 'cash'),
        ], 'chart' => null, 'sections' => [
            self::section('Product warranties by status (now)', ['Status', 'Count'], ['text', 'int'], $state('product')),
            self::section('Repair warranties by status (now)', ['Status', 'Count'], ['text', 'int'], $state('repair')),
            self::section('Expiring in the next 60 days', ['Warranty', 'Type', 'Customer', 'Expiry'], ['text', 'text', 'text', 'date'],
                $all->where('status', 'active')->filter(fn ($w) => $w->end_date->between(today(), today()->addDays(60)))->sortBy('end_date')
                    ->map(fn ($w) => [$w->no, ucfirst($w->kind), $w->customer?->name, $w->end_date->toDateString()])),
            self::section('Claims & decisions (registered in period)', ['Claim', 'Type', 'Status', 'Resolution', 'Cost'], ['text', 'text', 'text', 'text', 'money'],
                $claims->map(fn ($c) => [$c->no, ucfirst($c->kind), ucfirst($c->status), $c->resolution ? ucfirst($c->resolution) : '—', $c->cost])),
            self::section('Warranty unit replacements (period)', ['Ref', 'Date', 'Customer', 'Defective IMEI', 'Replacement IMEI', 'Warranty'], ['text', 'date', 'text', 'text', 'text', 'text'],
                $rpl->map(fn ($x) => [$x->no, $x->created_at->toDateString(), $x->customer?->name, $x->old_code, $x->new_code, $x->mode === 'fresh' ? 'Fresh period' : 'Remaining period'])),
            self::section('Warranty repair costs (parts & labour covered)', ['Job', 'Parts covered', 'Labour covered', 'Total covered'], ['text', 'money', 'money', 'money'],
                $wr->map(function ($r) {
                    $pc = $r->parts->where('covered', true)->sum(fn ($p) => $p->price * $p->qty);
                    $lc = $r->labor_covered ? $r->labor : 0;

                    return [$r->no, $pc, $lc, $pc + $lc];
                })),
        ], 'note' => null];
    }

    /* ======================= PROFIT & LOSS ======================= */
    private function pl(Carbon $from, Carbon $to): array
    {
        $sales = Sale::with(['items', 'returns', 'payments'])->where('status', '!=', 'cancelled')->whereDate('date', '>=', $from->toDateString())->whereDate('date', '<=', $to->toDateString())->get()->map(fn ($s) => self::saleNums($s));
        $rd = Repair::with('parts')->where('status', 'delivered')->whereBetween('delivered_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])->get()->map(fn ($r) => Totals::repair($r));
        $exp = (float) Expense::where('status', 'posted')->whereDate('date', '>=', $from->toDateString())->whereDate('date', '<=', $to->toDateString())->sum('amount');
        $claims = (float) Claim::where('status', 'resolved')->whereBetween('updated_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])->sum('cost');
        $salesRev = $sales->sum('net') - $sales->sum('tax');
        $gross = $salesRev - $sales->sum('cost') + $rd->sum('total') - $rd->sum('cost');

        return ['salesRev' => $salesRev, 'cogs' => $sales->sum('cost'), 'repRev' => $rd->sum('total'), 'repCost' => $rd->sum('cost'), 'gross' => $gross, 'exp' => $exp + $claims, 'net' => $gross - $exp - $claims, 'tax' => $sales->sum('tax')];
    }

    public function financial(): array
    {
        Shop::need('reports', 'manage');
        $cur = $this->pl($this->from, $this->to);
        $rev = $cur['salesRev'] + $cur['repRev'];
        $months = collect(range(11, 0))->map(function ($i) {
            $m = $this->to->copy()->startOfMonth()->subMonthsNoOverflow($i);
            $x = $this->pl($m, $m->copy()->endOfMonth());

            return [$m->format('M Y'), $x['salesRev'], $x['cogs'], $x['repRev'], $x['repCost'], $x['gross'], $x['exp'], $x['net']];
        });

        return ['kpis' => [
            self::kpi('Revenue (excl. tax)', $rev, 'money', 'Sales '.Shop::fmt($cur['salesRev']).' · Repairs '.Shop::fmt($cur['repRev']), 'blue', 'receipt'),
            self::kpi('Cost of goods & repairs', $cur['cogs'] + $cur['repCost'], 'money', '', 'amber', 'package'),
            self::kpi('Gross profit', $cur['gross'], 'money', ($rev ? round($cur['gross'] / $rev * 100) : 0).'% margin', 'green', 'trendUp'),
            self::kpi('Expenses & warranty costs', $cur['exp'], 'money', '', 'red', 'wallet'),
            self::kpi('Estimated net profit', $cur['net'], 'money', '', $cur['net'] >= 0 ? 'green' : 'red', 'cash'),
            self::kpi(Shop::setting('tax_name', 'Tax').' collected', $cur['tax'], 'money', '', 'gray', 'file'),
        ], 'chart' => ['title' => 'Net profit by month', 'points' => $months->map(fn ($m) => ['label' => substr($m[0], 0, 3), 'tip' => $m[0], 'value' => round(max(0, $m[7]), 2)])->values()],
            'sections' => [self::section('Monthly profit & loss (12 months to '.$this->to->format('M Y').')', ['Month', 'Sales (ex tax)', 'COGS', 'Repair revenue', 'Repair cost', 'Gross profit', 'Expenses', 'Net profit'],
                ['text', 'money', 'money', 'money', 'money', 'money', 'money', 'money'], $months)],
            'note' => 'Estimated figures. Costing: '.Shop::setting('costing').' Warranty claim costs are included in expenses.'];
    }
}
