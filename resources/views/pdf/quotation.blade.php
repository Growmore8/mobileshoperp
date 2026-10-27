@extends('pdf.layout')
@section('body')
<table class="cols"><tr>
  <td><div class="box"><h4>Customer</h4><b>{{ $q->customer?->name ?? 'Walk-in customer' }}</b>@if($q->customer)<div>{{ $q->customer->phone }}</div>@endif</div></td>
  <td><div class="box"><h4>Prepared by</h4>{{ $q->user?->name }}@if($q->note)<div class="muted">{{ $q->note }}</div>@endif</div></td>
</tr></table>
<table class="items">
  <thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
  <tbody>@foreach($q->items as $i => $it)<tr><td>{{ $i + 1 }}</td><td>{{ $it->name }}</td><td class="num">{{ $it->qty }}</td><td class="num">{{ $money($it->price) }}</td><td class="num">{{ $money($it->line_total) }}</td></tr>@endforeach</tbody>
</table>
<table class="totals">
  <tr><td>Subtotal</td><td class="num">{{ $money($q->subtotal) }}</td></tr>
  @if($q->discount > 0)<tr><td>Discount</td><td class="num">−{{ $money($q->discount) }}</td></tr>@endif
  <tr><td>{{ $settings['tax_name'] ?? 'Tax' }} {{ !empty($settings['tax_inclusive']) ? '(included)' : '' }}</td><td class="num">{{ $money($q->tax) }}</td></tr>
  <tr class="grand"><td>Total</td><td class="num">{{ $money($q->total) }}</td></tr>
</table>
<div class="terms">Prices and availability are valid until {{ $q->valid_until->format('d M Y') }}. This is not a tax invoice.</div>
@endsection
