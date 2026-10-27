@extends('pdf.layout')
@section('body')
<table class="cols"><tr>
  <td><div class="box"><h4>Customer</h4><b>{{ $r->customer->name }}</b><div>{{ $r->customer->phone }}</div><div class="muted">ID {{ $r->customer->code }}</div></div></td>
  <td><div class="box"><h4>Device</h4><b>{{ $r->brand }} {{ $r->model }}</b> {{ $r->color }}<div class="mono">{{ $r->imei ? 'IMEI '.$r->imei : 'S/N '.$r->serial }}</div>
    <div class="muted">Accessories: {{ implode(', ', $r->accessories ?? []) ?: 'None' }}</div></div></td>
</tr><tr>
  <td><div class="box"><h4>Reported problem</h4>{{ $r->problem }}</div></td>
  <td><div class="box"><h4>Condition at intake</h4>{{ $r->condition }}@if($r->existing_damage)<div class="bad">Existing damage: {{ $r->existing_damage }}</div>@endif</div></td>
</tr></table>
@if($kind !== 'receipt' && $r->diagnosis)<div class="box" style="margin-bottom:8px"><h4>Diagnosis / work done</h4>{{ $r->diagnosis }}</div>@endif
@if($kind === 'receipt')
  <div class="box"><h4>Estimate</h4><div class="big">{{ $r->estimate > 0 ? $money($r->estimate) : 'After diagnosis' }}</div>
  <div class="muted">Advance paid: {{ $money($t['paid']) }} · Expected: {{ $r->expected_date?->format('d M Y') }}</div></div>
@else
  <table class="items"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
    @foreach($r->parts as $p)<tr><td>{{ $p->name }}@if($p->covered) <span class="tag">Warranty</span>@endif</td><td class="num">{{ $p->qty }}</td><td class="num">{{ $money($p->price) }}</td><td class="num">{{ $money($p->covered ? 0 : $p->price * $p->qty) }}</td></tr>@endforeach
    <tr><td>Labour – {{ $r->type }}@if($r->labor_covered) <span class="tag">Warranty</span>@endif</td><td class="num">1</td><td class="num">{{ $money($r->labor) }}</td><td class="num">{{ $money($t['labor']) }}</td></tr>
  </tbody></table>
  <table class="totals">
    @if($r->discount > 0)<tr><td>Discount</td><td class="num">−{{ $money($r->discount) }}</td></tr>@endif
    <tr class="grand"><td>Total</td><td class="num">{{ $money($t['total']) }}</td></tr>
    <tr><td>Paid</td><td class="num">{{ $money($t['paid']) }}</td></tr>
    <tr><td><b>Balance</b></td><td class="num"><b>{{ $money($t['balance']) }}</b></td></tr>
  </table>
@endif
@if($kind === 'delivery')
  <div class="box" style="margin-top:10px"><h4>Handover</h4>Collected by <b>{{ $r->collected_by }}</b> · Handed over by {{ $r->deliverer?->name }} on {{ $r->delivered_at?->format('d M Y, H:i') }}
    @if($r->warranty)<div>Repair warranty <b>{{ $r->warranty->no }}</b>: @foreach($r->warranty->components as $c){{ $c->label }} until {{ $c->end_date->format('d M Y') }}@if(!$loop->last); @endif @endforeach</div>@else<div class="muted">No repair warranty applicable.</div>@endif
    @if($signature)<div style="margin-top:6px"><img src="{{ $signature }}" style="height:55px"></div>@elseif($r->signature_path)<div class="ok" style="margin-top:4px">✔ Signed by customer on delivery</div>@endif
  </div>
@endif
<div class="terms"><b>Repair terms:</b> The shop is not responsible for data loss; please back up your device. Devices not collected within 60 days of notification may be disposed of to recover costs. {{ $settings['terms']['repair'] ?? '' }}</div>
<table class="sign"><tr><td><div>Customer signature</div></td><td><div>Received / handed over by</div></td></tr></table>
@endsection
