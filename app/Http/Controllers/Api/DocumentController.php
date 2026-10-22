<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Purchase;
use App\Models\Quotation;
use App\Models\Repair;
use App\Models\Replacement;
use App\Models\Sale;
use App\Models\Setting;
use App\Models\Warranty;
use App\Services\Shop;
use App\Services\Totals;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/** Downloadable PDFs: invoices, quotations, warranty certificates, repair documents, statements, GRNs. */
class DocumentController extends Controller
{
    private function pdf(string $view, string $filename, string $docTitle, string $meta, array $data): Response
    {
        $settings = Setting::map();
        $words = preg_split('/\s+/', trim($settings['shop_name'] ?? 'S'));
        $initials = strtoupper(mb_substr($words[0] ?? 'S', 0, 1).mb_substr($words[1] ?? '', 0, 1));

        return Pdf::loadView("pdf.$view", $data + [
            'settings' => $settings, 'initials' => $initials, 'title' => $filename, 'docTitle' => $docTitle, 'meta' => $meta,
            'money' => fn ($v) => Shop::fmt($v),
        ])->setPaper('a4')->download($filename.'.pdf');
    }

    private static function meta(string $no, string ...$lines): string
    {
        return '<div class="mono"><b>'.e($no).'</b></div>'.implode('', array_map(fn ($l) => '<div class="muted">'.e($l).'</div>', $lines));
    }

    public function invoice(int $id): Response
    {
        $sale = Sale::with(['customer', 'user:id,name', 'items.warranty', 'payments', 'returns'])
            ->when(! Shop::can('sales', 'manage'), fn ($q) => $q->where('user_id', Auth::id()))->findOrFail($id);
        $status = $sale->status !== 'completed' ? strtoupper(str_replace('_', ' ', $sale->status)) : '';

        return $this->pdf('invoice', $sale->no, 'Tax Invoice', self::meta($sale->no, $sale->created_at->format('d M Y, H:i'), 'Served by '.$sale->user?->name, $status), [
            'sale' => $sale, 't' => Totals::sale($sale), 'replacements' => Replacement::where('sale_id', $sale->id)->get(),
        ]);
    }

    public function quotation(Quotation $quotation): Response
    {
        $quotation->load(['customer', 'user:id,name', 'items']);

        return $this->pdf('quotation', $quotation->no, 'Quotation', self::meta($quotation->no, $quotation->date->format('d M Y'), 'Valid until '.$quotation->valid_until->format('d M Y')), ['q' => $quotation]);
    }

    public function warranty(Warranty $warranty): Response
    {
        $warranty->load(['customer', 'product', 'components']);

        return $this->pdf('warranty', $warranty->no, $warranty->kind === 'repair' ? 'Repair Warranty' : 'Warranty Certificate', self::meta($warranty->no), ['w' => $warranty]);
    }

    public function repair(Request $request, int $id): Response
    {
        $kind = $request->validate(['kind' => 'nullable|in:receipt,estimate,invoice,delivery'])['kind'] ?? 'receipt';
        $r = Repair::with(['customer', 'parts', 'warranty.components', 'deliverer:id,name'])
            ->when(! Shop::can('repairs', 'manage'), fn ($q) => $q->where(fn ($w) => $w->whereNull('technician_id')->orWhere('technician_id', Auth::id())->orWhere('created_by', Auth::id())))
            ->findOrFail($id);
        abort_if($kind === 'delivery' && $r->status !== 'delivered', 422, 'The delivery receipt is available after delivery.');
        // signature image needs the GD extension for PNG transparency; without it the PDF states that the customer signed
        $sig = $r->signature_path && extension_loaded('gd') && Storage::disk('local')->exists($r->signature_path)
            ? 'data:image/png;base64,'.base64_encode(Storage::disk('local')->get($r->signature_path)) : null;
        $titles = ['receipt' => 'Repair Job Receipt', 'estimate' => 'Repair Estimate', 'invoice' => 'Repair Invoice', 'delivery' => 'Delivery Receipt'];

        return $this->pdf('repair', "{$r->no}-$kind", $titles[$kind], self::meta($r->no, 'Received '.$r->received_at->format('d M Y, H:i'), $r->delivered_at ? 'Delivered '.$r->delivered_at->format('d M Y, H:i') : '', $r->is_warranty_repair ? 'WARRANTY REPAIR' : ''), [
            'r' => $r, 'kind' => $kind, 't' => Totals::repair($r), 'signature' => $sig,
        ]);
    }

    public function statement(Customer $customer): Response
    {
        Shop::need('sales', 'view'); // statements contain money owed
        $docs = Sale::where('customer_id', $customer->id)->with(['items:id,sale_id,name', 'returns', 'payments'])->get()
            ->map(fn ($s) => ['at' => $s->created_at, 'ref' => $s->no, 'desc' => $s->items->pluck('name')->implode(', ').($s->status === 'cancelled' ? ' (cancelled)' : ''), 't' => Totals::sale($s), 'cancelled' => $s->status === 'cancelled'])
            ->concat(Repair::where('customer_id', $customer->id)->where('status', 'delivered')->get()
                ->map(fn ($r) => ['at' => $r->delivered_at, 'ref' => $r->no, 'desc' => "Repair: {$r->brand} {$r->model} — {$r->type}", 't' => Totals::repair($r) + ['net' => Totals::repair($r)['total']], 'cancelled' => false]))
            ->sortBy('at')->map(fn ($d) => ['date' => $d['at']->format('d M Y'), 'ref' => $d['ref'], 'desc' => $d['desc'], 'amount' => $d['t']['net'], 'paid' => $d['t']['paid'], 'balance' => $d['cancelled'] ? 0 : $d['t']['balance']])->values();

        return $this->pdf('statement', "Statement-{$customer->code}", 'Customer Statement', self::meta($customer->code, now()->format('d M Y')), [
            'c' => $customer, 'docs' => $docs, 'balance' => Totals::customerBalance($customer->id),
        ]);
    }

    public function purchase(Purchase $purchase): Response
    {
        $purchase->load(['supplier', 'items.product:id,name']);

        return $this->pdf('purchase', $purchase->no, $purchase->status === 'ordered' ? 'Purchase Order' : 'Goods Received Note', self::meta($purchase->no, $purchase->date->format('d M Y')), [
            'p' => $purchase, 'devices' => Device::where('purchase_id', $purchase->id)->get(),
        ]);
    }
}
