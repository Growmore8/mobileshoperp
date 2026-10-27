<?php

use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\RepairController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\WarrantyController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

/*
| Every route below the login requires a valid token (auth:sanctum), an active
| account (active) and the specific permission (perm:module,action).
| The UI hides what a user cannot do; these checks make sure they cannot do it anyway.
*/

Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::get('meta', [AuthController::class, 'meta']);

Route::middleware(['auth:sanctum', 'active', 'throttle:api'])->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::get('sync', SyncController::class); // UI data, filtered by role
    Route::post('demo/reset', [AuthController::class, 'resetDemo']); // only when SHOP_DEMO=true, admins only
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::post('auth/password', [AuthController::class, 'changePassword']);
    Route::post('auth/confirm-password', [AuthController::class, 'confirmPassword'])->middleware('throttle:6,1');

    // Settings
    Route::get('settings', [SettingsController::class, 'show'])->middleware('perm:settings,view');
    Route::put('settings', [SettingsController::class, 'update'])->middleware('perm:settings,manage');

    // Users & roles
    Route::get('users', [UserController::class, 'index'])->middleware('perm:users,view');
    Route::post('users', [UserController::class, 'store'])->middleware('perm:users,create');
    Route::put('users/{user}', [UserController::class, 'update'])->middleware('perm:users,edit');
    Route::patch('users/{user}/active', [UserController::class, 'setActive'])->middleware('perm:users,edit');

    Route::get('roles', [RoleController::class, 'index'])->middleware('perm:users,view');
    Route::post('roles', [RoleController::class, 'store'])->middleware('perm:users,manage');
    Route::put('roles/{role}', [RoleController::class, 'update'])->middleware('perm:users,manage');
    Route::delete('roles/{role}', [RoleController::class, 'destroy'])->middleware('perm:users,manage');

    // Audit trail
    Route::get('activity', [ActivityLogController::class, 'index'])->middleware('perm:users,view');

    // Catalog
    Route::get('categories', [CatalogController::class, 'categories']);
    Route::put('categories/{category}', [CatalogController::class, 'updateCategory'])->middleware('perm:settings,manage');
    Route::get('products', [CatalogController::class, 'products'])->middleware('perm:products,view|pos,view|inventory,view|repairs,edit');
    Route::post('products', [CatalogController::class, 'storeProduct'])->middleware('perm:products,create');
    Route::put('products/{product}', [CatalogController::class, 'updateProduct'])->middleware('perm:products,edit');
    Route::delete('products/{product}', [CatalogController::class, 'destroyProduct'])->middleware('perm:products,delete');
    Route::post('products/{product}/image', [CatalogController::class, 'productImage'])->middleware('perm:products,edit');

    Route::get('customers', [CatalogController::class, 'customers'])->middleware('perm:customers,view|pos,view|repairs,create');
    Route::get('customers/{customer}', [CatalogController::class, 'customer'])->middleware('perm:customers,view');
    Route::post('customers', [CatalogController::class, 'storeCustomer'])->middleware('perm:customers,create');
    Route::put('customers/{customer}', [CatalogController::class, 'updateCustomer'])->middleware('perm:customers,edit');
    Route::post('customers/{customer}/payments', [CatalogController::class, 'customerPayment'])->middleware('perm:sales,edit');

    Route::get('suppliers', [CatalogController::class, 'suppliers'])->middleware('perm:suppliers,view|purchases,view');
    Route::post('suppliers', [CatalogController::class, 'storeSupplier'])->middleware('perm:suppliers,create');
    Route::put('suppliers/{supplier}', [CatalogController::class, 'updateSupplier'])->middleware('perm:suppliers,edit');

    // Inventory & IMEI tracking
    Route::get('devices/lookup', [CatalogController::class, 'lookupDevice'])->middleware('perm:inventory,view|pos,view|warranties,view');
    Route::get('devices', [InventoryController::class, 'devices'])->middleware('perm:inventory,view|pos,view');
    Route::get('devices/{device}', [InventoryController::class, 'device'])->middleware('perm:inventory,view');
    Route::get('stock-movements', [InventoryController::class, 'movements'])->middleware('perm:inventory,view');
    Route::get('adjustments', [InventoryController::class, 'adjustments'])->middleware('perm:inventory,view');
    Route::post('adjustments', [InventoryController::class, 'requestAdjustment'])->middleware('perm:inventory,create');
    Route::post('adjustments/{adjustment}/approve', [InventoryController::class, 'approveAdjustment'])->middleware('perm:inventory,approve');
    Route::post('adjustments/{adjustment}/reject', [InventoryController::class, 'rejectAdjustment'])->middleware('perm:inventory,approve');

    // Purchases
    Route::get('purchases', [InventoryController::class, 'purchases'])->middleware('perm:purchases,view');
    Route::get('purchases/{purchase}', [InventoryController::class, 'purchase'])->middleware('perm:purchases,view');
    Route::post('purchases', [InventoryController::class, 'storePurchase'])->middleware('perm:purchases,create');
    Route::post('purchases/{purchase}/receive', [InventoryController::class, 'receivePurchase'])->middleware('perm:purchases,create');
    Route::post('purchases/{purchase}/cancel', [InventoryController::class, 'cancelPurchase'])->middleware('perm:purchases,cancel');
    Route::post('purchases/{purchase}/payments', [InventoryController::class, 'payPurchase'])->middleware('perm:purchases,edit');
    Route::post('purchases/{purchase}/returns', [InventoryController::class, 'returnPurchase'])->middleware('perm:purchases,approve');

    // Sales / POS
    Route::get('sales', [SaleController::class, 'index'])->middleware('perm:sales,view');
    Route::get('sales/{id}', [SaleController::class, 'show'])->whereNumber('id')->middleware('perm:sales,view');
    Route::post('sales', [SaleController::class, 'store'])->middleware('perm:pos,create');
    Route::post('sales/{sale}/payments', [SaleController::class, 'pay'])->middleware('perm:sales,edit');
    Route::post('sales/{sale}/refunds', [SaleController::class, 'refund'])->middleware('perm:sales,refund');
    Route::post('sales/{sale}/cancel', [SaleController::class, 'cancel'])->middleware('perm:sales,cancel');
    Route::get('quotations', [SaleController::class, 'quotations'])->middleware('perm:sales,view|pos,view');
    Route::post('quotations', [SaleController::class, 'storeQuotation'])->middleware('perm:pos,create');

    // Repairs
    Route::get('repairs', [RepairController::class, 'index'])->middleware('perm:repairs,view');
    Route::get('repairs/{id}', [RepairController::class, 'show'])->whereNumber('id')->middleware('perm:repairs,view');
    Route::post('repairs', [RepairController::class, 'store'])->middleware('perm:repairs,create');
    Route::put('repairs/{id}', [RepairController::class, 'update'])->middleware('perm:repairs,edit');
    Route::post('repairs/{id}/status', [RepairController::class, 'status'])->middleware('perm:repairs,edit');
    Route::post('repairs/{id}/approval', [RepairController::class, 'approval'])->middleware('perm:repairs,edit');
    Route::post('repairs/{id}/parts', [RepairController::class, 'addPart'])->middleware('perm:repairs,edit');
    Route::delete('repairs/{id}/parts/{part}', [RepairController::class, 'removePart'])->middleware('perm:repairs,edit');
    Route::post('repairs/{id}/payments', [RepairController::class, 'pay'])->middleware('perm:repairs,edit|repairs,deliver');
    Route::post('repairs/{id}/deliver', [RepairController::class, 'deliver'])->middleware('perm:repairs,deliver');
    Route::post('repairs/{id}/cancel', [RepairController::class, 'cancel'])->middleware('perm:repairs,cancel');
    Route::post('repairs/{id}/photos', [RepairController::class, 'photo'])->middleware('perm:repairs,edit');

    // Warranties, claims & replacements
    Route::get('warranties', [WarrantyController::class, 'index'])->middleware('perm:warranties,view');
    Route::get('warranties/lookup', [WarrantyController::class, 'lookup'])->middleware('perm:warranties,view');
    Route::get('warranties/{warranty}', [WarrantyController::class, 'show'])->middleware('perm:warranties,view');
    Route::post('warranties/{warranty}/extend', [WarrantyController::class, 'extend'])->middleware('perm:warranties,approve');
    Route::get('claims', [WarrantyController::class, 'claims'])->middleware('perm:warranties,view');
    Route::get('claims/{claim}', [WarrantyController::class, 'claim'])->middleware('perm:warranties,view');
    Route::post('claims', [WarrantyController::class, 'storeClaim'])->middleware('perm:warranties,create');
    Route::put('claims/{claim}', [WarrantyController::class, 'updateClaim'])->middleware('perm:warranties,edit|warranties,approve');
    Route::post('claims/{claim}/photos', [WarrantyController::class, 'claimPhoto'])->middleware('perm:warranties,create|warranties,edit');
    Route::post('claims/{claim}/repair', [WarrantyController::class, 'claimRepair'])->middleware('perm:repairs,create');
    Route::post('claims/{claim}/replace', [WarrantyController::class, 'replace'])->middleware('perm:warranties,approve');

    // Reports (any date range) & PDF documents
    Route::get('reports/{type}', ReportController::class)->middleware('perm:reports,view');
    Route::get('documents/invoice/{id}', [DocumentController::class, 'invoice'])->whereNumber('id')->middleware('perm:sales,print|pos,print');
    Route::get('documents/quotation/{quotation}', [DocumentController::class, 'quotation'])->middleware('perm:pos,print|sales,print');
    Route::get('documents/warranty/{warranty}', [DocumentController::class, 'warranty'])->middleware('perm:warranties,print');
    Route::get('documents/repair/{id}', [DocumentController::class, 'repair'])->whereNumber('id')->middleware('perm:repairs,print');
    Route::get('documents/statement/{customer}', [DocumentController::class, 'statement'])->middleware('perm:customers,print');
    Route::get('documents/purchase/{purchase}', [DocumentController::class, 'purchase'])->middleware('perm:purchases,print');

    // Expenses
    Route::get('expenses', [WarrantyController::class, 'expenses'])->middleware('perm:expenses,view');
    Route::post('expenses', [WarrantyController::class, 'storeExpense'])->middleware('perm:expenses,create');
    Route::post('expenses/{expense}/void', [WarrantyController::class, 'voidExpense'])->middleware('perm:expenses,delete');
});
