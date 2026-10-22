<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\Claim;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Quotation;
use App\Models\Repair;
use App\Models\Replacement;
use App\Models\Role;
use App\Models\Sale;
use App\Models\Setting;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warranty;
use App\Support\ClientShape;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Hydrates the UI's in-memory store.
 *  GET /api/sync            → everything this user may see (recent window + all open items)
 *  GET /api/sync?since=ISO  → only records changed since then (child changes touch their parent)
 * Visibility mirrors the permission matrix: own invoices / own repair jobs for non-managers,
 * no cost data without financial permission, no modules the role cannot open.
 */
class SyncController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user()->load('role');
        $can = fn (string $m, string $a = 'view') => $user->hasPermission($m, $a);
        $since = $request->filled('since') ? Carbon::parse($request->query('since')) : null;
        $now = now();
        $from = $now->copy()->subDays((int) config('shop.sync_days', 730))->startOfDay();
        $shape = new ClientShape($can('reports', 'manage') || $can('purchases', 'view'));

        $changed = fn (Builder $q, string $col = 'updated_at') => $since ? $q->where($col, '>', $since) : $q;
        $out = ['now' => $now->toIso8601ZuluString('millisecond'), 'full' => ! $since];

        $out['me'] = ['id' => (string) $user->id, 'name' => $user->name, 'username' => $user->username, 'roleId' => (string) $user->role_id, 'active' => $user->active];
        $out['settings'] = ClientShape::settings(Setting::map());
        $out['roles'] = Role::orderBy('id')->get()->map(fn ($r) => $shape->role($r))->all();
        $out['users'] = User::orderBy('name')->get()->map(fn ($u) => $shape->user($u, $can('users')))->all();
        $out['categories'] = Category::orderBy('id')->get()->map(fn ($c) => $shape->category($c))->all();

        if ($can('suppliers') || $can('purchases') || $can('inventory')) {
            $out['suppliers'] = $changed(Supplier::query())->orderBy('name')->get()->map(fn ($s) => $shape->supplier($s))->all();
        }
        if ($can('customers') || $can('pos') || $can('repairs') || $can('sales')) {
            $out['customers'] = $changed(Customer::query())->orderBy('name')->get()->map(fn ($c) => $shape->customer($c))->all();
        }
        if ($can('products') || $can('pos') || $can('inventory') || $can('repairs')) {
            $out['products'] = $changed(Product::query())->orderBy('id')->get()->map(fn ($p) => $shape->product($p))->all();
        }
        if ($can('inventory') || $can('pos') || $can('warranties') || $can('repairs')) {
            $q = Device::with('events')->where(fn ($w) => $w->where('status', '!=', 'sold')->orWhere('sold_at', '>=', $from)->orWhere('updated_at', '>=', $from));
            $out['devices'] = $changed($q)->orderByDesc('id')->get()->map(fn ($d) => $shape->device($d))->all();
        }
        if ($can('sales') || $can('pos', 'create')) {
            $q = Sale::with(['items', 'payments', 'returns'])->where('date', '>=', $from->toDateString())
                ->when(! $can('sales', 'manage'), fn ($b) => $b->where('user_id', $user->id));
            $sales = $changed($q)->orderByDesc('id')->get();
            $shape->replacementsBySale = Replacement::whereIn('sale_id', $sales->pluck('id'))->get()->groupBy('sale_id');
            $out['sales'] = $sales->map(fn ($s) => $shape->sale($s))->all();
            $out['quotes'] = $changed(Quotation::with('items')->where('date', '>=', $from->toDateString()))->orderByDesc('id')->get()->map(fn ($x) => $shape->quote($x))->all();
        }
        if ($can('purchases')) {
            $purchases = $changed(Purchase::with(['items', 'payments', 'returns'])->where(fn ($w) => $w->where('date', '>=', $from->toDateString())->orWhere('status', 'ordered')))->orderByDesc('id')->get();
            $devs = Device::whereIn('purchase_id', $purchases->pluck('id'))->get(['id', 'product_id', 'purchase_id'])->groupBy('purchase_id');
            $purchases->each(fn ($p) => $p->setRelation('devicesForSync', $devs->get($p->id, collect())));
            $out['purchases'] = $purchases->map(fn ($p) => $shape->purchase($p))->all();
        }
        if ($can('repairs')) {
            $q = Repair::with(['parts', 'payments', 'attachments', 'events'])
                ->where(fn ($w) => $w->where('received_at', '>=', $from)->orWhereNotIn('status', ['delivered', 'cancelled']))
                ->when(! $can('repairs', 'manage'), fn ($b) => $b->where(fn ($w) => $w->whereNull('technician_id')->orWhere('technician_id', $user->id)->orWhere('created_by', $user->id)));
            $out['repairs'] = $changed($q)->orderByDesc('id')->get()->map(fn ($r) => $shape->repair($r))->all();
        }
        if ($can('warranties') || $can('repairs')) {
            $q = Warranty::with(['events', 'components'])->where(fn ($w) => $w->where('end_date', '>=', $now->copy()->subYear())->orWhere('created_at', '>=', $from));
            $out['warranties'] = $changed($q)->orderByDesc('id')->get()->map(fn ($w) => $shape->warranty($w))->all();
            $out['claims'] = $changed(Claim::with(['events', 'attachments'])->where(fn ($w) => $w->where('created_at', '>=', $from)->orWhereIn('status', ['pending', 'inspection', 'approved'])))
                ->orderByDesc('id')->get()->map(fn ($c) => $shape->claim($c))->all();
            $out['replacements'] = $changed(Replacement::query())->orderByDesc('id')->get()->map(fn ($x) => $shape->replacement($x))->all();
        }
        if ($can('expenses')) {
            $out['expenses'] = $changed(Expense::where('date', '>=', $from->toDateString()))->orderByDesc('date')->orderByDesc('id')->get()->map(fn ($e) => $shape->expense($e))->all();
        }
        if ($can('inventory')) {
            $out['stockMoves'] = $changed(StockMovement::where('created_at', '>=', $from), 'created_at')->orderByDesc('id')->get()->map(fn ($m) => $shape->movement($m))->all();
            $out['adjustments'] = $changed(StockAdjustment::where('created_at', '>=', $from))->orderByDesc('id')->get()->map(fn ($a) => $shape->adjustment($a))->all();
        }
        if ($can('users')) {
            $out['activity'] = $changed(ActivityLog::query(), 'created_at')->orderByDesc('id')->limit(1500)->get()->map(fn ($a) => $shape->activity($a))->all();
        }

        return response()->json($out);
    }
}
