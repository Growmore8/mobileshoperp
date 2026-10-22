<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A business rule was violated (e.g. duplicate IMEI, insufficient stock).
 * Rendered as HTTP 422 with a human-readable message for the UI.
 */
class BusinessRuleException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422)
    {
        parent::__construct($message);
    }
}
