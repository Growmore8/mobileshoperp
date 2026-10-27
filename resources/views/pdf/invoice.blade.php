@extends('pdf.layout')
@section('body')
@php($c = $sale->customer)
<table class="cols"><tr>
  <td><div class="box"><h4>Customer</h4><b>{{ $c?->name ?? 'Walk-in customer' }}</b>
    @if($c)<div>{{ $c->phone }}@if($c->email) · {{ $c->email }}@endif</div><div class="muted">{{ $c->address }}</div><div class="muted">ID {{ $c->code }}</div>@endif</div></td>
  <td><div class="box"><h4>Payment status</h4>
    @if($t['balance'] > 0)<div class="big bad">Balance {{ $money($t['balance']) }}</div>@else<div class="big ok">PAID</div>@endif
    <div class="muted">Paid {{ $money($t['paid']) }} of {{ $money($t['net']) }}</div></div></td>
</tr></table>
<table class="items">
  <thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Disc.</th><th class="num">Amount</th></tr></thead>
  <tbody>
  @foreach($sale->items as $i => $it)
    <tr><td>{{ $i + 1 }}</td><td><b>{{ $it->name }}</b>
      @if($it->code)<div class="mono">IMEI/SN: {{ $it->code }}</div>@endif
      @if($it->warranty)<div class="muted">Warranty {{ $it->warranty->no }}: {{ $it->warranty->months }} months {{ $it->warranty->provider }} — until {{ $it->warranty->end_date->format('d M Y') }}@if($it->warranty->status !== 'active') ({{ strtoupper($it->warranty->status) }})@endif</div>@endif
      @if($it->returned_qty)<div class="bad">Returned: {{ $it->returned_qty }}</div>@endif</td>
      <td class="num">{{ $it->qty }}</td><td class="num">{{ $money($it->price) }}</td><td class="num">{{ $it->discount ? $money($it->discount) : '—' }}</td><td class="num">{{ $money($it->line_total) }}</td></tr>
  @endforeach
  </tbody>
</table>
@if($replacements->count())
<div class="box" style="margin-top:8px"><h4>Warranty replacements</h4>
  @foreach($replacements as $x)<div>{{ $x->created_at->format('d M Y') }}: defective <span class="mono">{{ $x->old_code }}</span> replaced by <span class="mono">{{ $x->new_code }}</span> ({{ $x->no }})</div>@endforeach
</div>
@endif
<table class="totals">
  <tr><td>Subtotal</td><td class="num">{{ $money($sale->subtotal) }}</td></tr>
  @if($sale->discount > 0)<tr><td>Discount{{ $sale->discount_percent ? ' ('.rtrim(rtrim(number_format((float) $sale->discount_percent, 2), '0'), '.').'% off)' : '' }}</td><td class="num">−{{ $money($sale->discount) }}</td></tr>@endif
  @php($vatRate = $sale->tax_rate ?? ($settings['tax_rate'] ?? 0))
  @if($sale->tax > 0 || $vatRate > 0)<tr><td>{{ $settings['tax_name'] ?? 'Tax' }} {{ rtrim(rtrim(number_format((float) $vatRate, 2), '0'), '.') }}% {{ $sale->tax_inclusive ? '(included)' : '' }}</td><td class="num">{{ $money($sale->tax) }}</td></tr>@endif
  @if($t['returned'] > 0)<tr><td>Returns</td><td class="num">−{{ $money($t['returned']) }}</td></tr>@endif
  <tr class="grand"><td>Total</td><td class="num">{{ $money($t['net']) }}</td></tr>
  @if($sale->change_given > 0)<tr><td>Change given</td><td class="num">{{ $money($sale->change_given) }}</td></tr>@endif
</table>
<h2>Payments</h2>
<table class="items"><thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>
  @forelse($sale->payments as $p)<tr><td>{{ $p->created_at->format('d M Y, H:i') }}</td><td>{{ $p->method }}@if($p->reference) · {{ $p->reference }}@endif</td><td class="num">{{ $money($p->amount) }}</td></tr>
  @empty<tr><td colspan="3" class="muted">No payments</td></tr>@endforelse
</tbody></table>
<div class="terms"><b>Warranty terms:</b> {{ $settings['terms']['product'] ?? '' }}<br><br>{{ $settings['invoice_footer'] ?? '' }}</div>
<table class="sign"><tr><td><div>Customer signature</div></td><td><div>Authorised signature</div></td></tr></table>
@endsection
