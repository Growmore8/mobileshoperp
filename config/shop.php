<?php

return [
    // How many days of closed transactions the UI loads at sign-in (open items are always loaded).
    'sync_days' => (int) env('SHOP_SYNC_DAYS', 730),

    // Allows "Reset demo data" from the UI. Must be false in production.
    'demo' => (bool) env('SHOP_DEMO', false),

    // Shown as one-click sign-in buttons on the login page — only when demo mode is on.
    'demo_accounts' => [
        ['admin', 'admin123'], ['manager', 'manager123'], ['sales', 'sales123'], ['tech', 'tech123'], ['store', 'store123'], ['tom', 'tom123'],
    ],
];
