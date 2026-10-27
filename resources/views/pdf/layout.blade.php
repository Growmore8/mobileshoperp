<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>{{ $title }}</title>
<style>
  @page { margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", sans-serif; color: #161616; font-size: 10.5px; line-height: 1.45; }
  h1 { font-size: 17px; margin: 0; } h2 { font-size: 12.5px; margin: 14px 0 6px; }
  .muted { color: #5f6873; } .right { text-align: right; } .mono { font-family: "DejaVu Sans Mono", monospace; font-size: 10px; }
  .head { width: 100%; border-bottom: 3px solid #29abe2; padding-bottom: 10px; margin-bottom: 12px; }
  .logo { width: 38px; height: 38px; background: #29abe2; color: #161616; font-weight: bold; font-size: 14px; text-align: center; line-height: 16px; padding-top: 11px; border-radius: 8px; border-right: 6px solid #39b54a; }
  .doc-title { font-size: 15px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; }
  .cols td { vertical-align: top; width: 50%; padding: 0 6px 8px 0; }
  .box { border: 1px solid #d9dee5; border-radius: 6px; padding: 8px 10px; }
  .box h4 { margin: 0 0 3px; font-size: 8.5px; text-transform: uppercase; letter-spacing: .8px; color: #5f6873; }
  .items th { background: #eef2f6; text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px; padding: 6px; border-bottom: 1px solid #c9d1da; }
  .items td { padding: 6px; border-bottom: 1px solid #e6eaef; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { width: 260px; margin-left: auto; margin-top: 6px; }
  .totals td { padding: 3px 6px; }
  .grand td { font-size: 13px; font-weight: bold; border-top: 2px solid #161616; padding-top: 6px; }
  .big { font-size: 16px; font-weight: bold; }
  .ok { color: #23782f; } .bad { color: #b91c1c; }
  .stamp { display: inline-block; border: 2px solid; border-radius: 6px; padding: 2px 9px; font-weight: bold; letter-spacing: 1px; }
  .tag { display: inline-block; padding: 1px 6px; border-radius: 8px; background: #e3f5e5; color: #1d6a28; font-size: 8.5px; font-weight: bold; }
  .terms { font-size: 8.5px; color: #4b5560; border-top: 1px dashed #c9d1da; padding-top: 8px; margin-top: 14px; }
  .sign td { width: 50%; padding: 34px 20px 0; }
  .sign div { border-top: 1px solid #8a939d; padding-top: 4px; text-align: center; color: #5f6873; font-size: 9px; }
  .cert { border: 3px double #29abe2; border-radius: 10px; padding: 16px; }
  .foot { position: fixed; bottom: -8mm; left: 0; right: 0; font-size: 8px; color: #8a939d; text-align: center; }
</style>
</head>
<body>
@php($s = $settings)
<div class="foot">{{ $s['shop_name'] ?? '' }} · {{ $s['phone'] ?? '' }} · Generated {{ now()->format('d M Y, H:i') }}</div>
<table class="head"><tr>
  @php($logoFile = public_path('assets/img/logo-mark-print.jpg'))
  <td style="width:62px;vertical-align:top">@if(is_file($logoFile))<img src="data:image/jpeg;base64,{{ base64_encode(file_get_contents($logoFile)) }}" style="width:54px;height:54px">@else<div class="logo">{{ $initials }}</div>@endif</td>
  <td style="vertical-align:top;padding-left:8px">
    <h1>{{ $s['shop_name'] ?? '' }}</h1>
    <div class="muted">{{ $s['address'] ?? '' }} · {{ $s['phone'] ?? '' }}</div>
    <div class="muted">{{ $s['email'] ?? '' }}@if(!empty($s['tax_id'])) · Tax ID {{ $s['tax_id'] }}@endif</div>
  </td>
  <td class="right" style="vertical-align:top">
    <div class="doc-title">{{ $docTitle }}</div>
    {!! $meta ?? '' !!}
  </td>
</tr></table>
@yield('body')
</body>
</html>
