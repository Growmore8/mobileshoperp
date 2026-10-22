@extends('pdf.layout')
@section('body')
@php($s2 = $p->supplier)
<table class="cols"><tr>
  <td><div class="box"><h4>Supplier</h4><b>{{ $s2->name }}</b><div>{{ $s2->contact }} · {{ $s2->phone }}</div><div class="muted">{{ $s2->address }}</div></div></td>
  <td><div class="box"><h4>Reference</h4>Supplier invoice: {{ $p->supplier_invoice ?: '—' }}<div class="muted">Terms: {{ $s2->terms ?: '—' }}</div></div></td>
</tr></table>
<table class="items"><thead><tr><th>Product</th><th>IMEI / serial</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Amount</th></tr></thead><tbody>
  @foreach($p->items as $it)
    <tr><td>{{ $it->product->name }}</td><td class="mono">{!! $devices->where('product_id', $it->product_id)->map(fn ($d) => e($d->code))->implode('<br>') ?: '—' !!}</td>
      <td class="num">{{ $it->qty }}</td><td class="num">{{ $money($it->cost) }}</td><td class="num">{{ $money($it->qty * $it->cost) }}</td></tr>
  @endforeach
</tbody></table>
<table class="totals"><tr class="grand"><td>Total</td><td class="num">{{ $money($p->total) }}</td></tr></table>
<table class="sign"><tr><td><div>Received by</div></td><td><div>Checked by</div></td></tr></table>
@endsection
