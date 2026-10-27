@extends('pdf.layout')
@section('body')
@php($isR = $w->kind === 'repair')
<div class="cert">
<table class="cols"><tr>
  <td><div class="box"><h4>Customer</h4><b>{{ $w->customer?->name ?? '—' }}</b><div>{{ $w->customer?->phone }}</div></div></td>
  <td><div class="box"><h4>{{ $isR ? 'Device' : 'Product' }}</h4><b>{{ $isR ? $w->device_label : $w->product?->name }}</b>
    @if($w->imei)<div class="mono">IMEI {{ $w->imei }}</div>@endif @if($w->serial)<div class="mono">S/N {{ $w->serial }}</div>@endif</div></td>
</tr><tr>
  <td><div class="box"><h4>{{ $isR ? 'Repair job' : 'Invoice' }}</h4>{{ $isR ? $w->job_no : $w->invoice_no }}@if($isR && $w->invoice_no)<div class="muted">Original invoice {{ $w->invoice_no }}</div>@endif</div></td>
  <td><div class="box"><h4>Validity</h4><b>{{ $w->start_date->format('d M Y') }} → {{ $w->end_date->format('d M Y') }}</b>
    <div class="muted">{{ $isR ? 'Separate from the original product warranty' : ($w->months.' months · '.$w->provider.' warranty · '.ucfirst((string) $w->condition)) }}</div></div></td>
</tr></table>
@if($w->replaces_warranty_id)
<div class="box" style="margin-bottom:8px"><h4>Warranty replacement</h4>This unit (<span class="mono">{{ $w->imei ?: $w->serial }}</span>) replaces the defective unit <span class="mono">{{ $w->replaced_device_code }}</span>. {{ $w->mode === 'remaining' ? 'Remaining original warranty (originally from '.$w->original_start?->format('d M Y').').' : 'Warranty period set at replacement: until '.$w->end_date->format('d M Y').'.' }}</div>
@endif
@if($isR)
<table class="items"><thead><tr><th>Coverage</th><th class="num">Period</th><th class="num">Valid until</th></tr></thead><tbody>
  @foreach($w->components as $c)<tr><td>{{ $c->label }}</td><td class="num">{{ $c->days }} days</td><td class="num">{{ $c->end_date->format('d M Y') }}</td></tr>@endforeach
</tbody></table>
@endif
<p style="margin-top:10px">Status: <span class="stamp {{ in_array($w->state, ['active', 'expiring']) ? 'ok' : 'bad' }}">{{ strtoupper(['active' => 'Active', 'expiring' => 'Active – expiring soon', 'expired' => 'Expired', 'void' => 'Void', 'replaced' => 'Replaced'][$w->state]) }}</span></p>
<div class="terms"><b>Terms &amp; conditions:</b> {{ $w->terms }}</div>
<table class="sign"><tr><td><div>Customer</div></td><td><div>For {{ $settings['shop_name'] ?? '' }}</div></td></tr></table>
</div>
@endsection
