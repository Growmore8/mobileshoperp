<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\Audit;
use App\Support\PasswordConfirm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    /** Settings every signed-in user needs (shop name on receipts, tax, currency…). */
    public const PUBLIC_KEYS = [
        'shop_name', 'tagline', 'address', 'phone', 'email', 'tax_id', 'currency', 'tax_name', 'tax_rate', 'tax_inclusive', 'tax_enabled',
        'invoice_prefix', 'invoice_footer', 'payment_methods', 'expense_categories', 'repair_types', 'terms',
        'expiring_days', 'warranty_start', 'repair_warranty_start', 'require_signature', 'costing', 'notify', 'channels',
    ];

    public function show(): JsonResponse
    {
        return response()->json(['settings' => Setting::map()]);
    }

    public function update(Request $request): JsonResponse
    {
        if (! PasswordConfirm::confirmed($request)) {
            return response()->json(['message' => 'Please confirm your password to change settings.', 'confirm_password' => true], 403);
        }
        $data = $request->validate([
            'shop_name' => ['sometimes', 'string', 'max:120'],
            'tagline' => ['sometimes', 'nullable', 'string', 'max:160'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'email' => ['sometimes', 'nullable', 'email', 'max:120'],
            'tax_id' => ['sometimes', 'nullable', 'string', 'max:60'],
            'currency' => ['sometimes', 'string', 'max:8'],
            'tax_name' => ['sometimes', 'string', 'max:20'],
            'tax_rate' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'tax_inclusive' => ['sometimes', 'boolean'],
            'tax_enabled' => ['sometimes', 'boolean'],
            'invoice_prefix' => ['sometimes', 'string', 'max:10', 'regex:/^[A-Z0-9-]+$/i'],
            'invoice_footer' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'costing' => ['sometimes', 'string', 'max:255'],
            'payment_methods' => ['sometimes', 'array', 'min:1'],
            'payment_methods.*' => ['string', 'max:30'],
            'expense_categories' => ['sometimes', 'array', 'min:1'],
            'expense_categories.*' => ['string', 'max:40'],
            'warranty_start' => ['sometimes', 'in:sale,activation'],
            'repair_warranty_start' => ['sometimes', 'in:delivery,completion'],
            'expiring_days' => ['sometimes', 'integer', 'min:1', 'max:365'],
            'require_signature' => ['sometimes', 'boolean'],
            'repair_types' => ['sometimes', 'array', 'min:1'],
            'repair_types.*.name' => ['required_with:repair_types', 'string', 'max:60'],
            'repair_types.*.labor_days' => ['required_with:repair_types', 'integer', 'min:0', 'max:730'],
            'terms' => ['sometimes', 'array'],
            'terms.product' => ['sometimes', 'string', 'max:3000'],
            'terms.used' => ['sometimes', 'string', 'max:3000'],
            'terms.repair' => ['sometimes', 'string', 'max:3000'],
            'notify' => ['sometimes', 'array'],
            'notify.*' => ['boolean'],
            'channels' => ['sometimes', 'array'],
            'channels.*' => ['boolean'],
        ]);

        $changed = [];
        foreach ($data as $key => $value) {
            if (Setting::get($key) !== $value) {
                Setting::put($key, $value);
                $changed[] = $key;
            }
        }
        Audit::log('settings', 'Settings changed', $changed ? implode(', ', $changed) : 'No changes');

        return response()->json(['settings' => Setting::map(), 'changed' => $changed]);
    }
}
