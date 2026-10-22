@extends('pdf.layout')
@section('body')
<table class="cols"><tr>
  <td><div class="box"><h4>Customer</h4><b>{{ $c->name }}</b><div>{{ $c->phone }}</div><div class="muted">{{ $c->address }}</div><div class="muted">ID {{ $c->code }}</div></div></td>
  <td><div class="box"><h4>Balance due</h4><div class="big {{ $balance > 0 ? 'bad' : 'ok' }}">{{ $money($balance) }}</div></div></td>
</tr></table>
<table class="items"><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead><tbody>
  @forelse($docs as $d)<tr><td>{{ $d['date'] }}</td><td class="mono">{{ $d['ref'] }}</td><td>{{ $d['desc'] }}</td><td class="num">{{ $money($d['amount']) }}</td><td class="num">{{ $money($d['paid']) }}</td><td class="num">{{ $money($d['balance']) }}</td></tr>
  @empty<tr><td colspan="6" class="muted">No transactions.</td></tr>@endforelse
</tbody></table>
@endsection
