# Reconciliation

Use `reconcileObject()` for a mapped object and `reconcilePages()` for bounded scans. Persist cursors and watermarks, overlap time windows, and keep report-only policy as the default. `convergeProviderState()` rejects lower provider versions and older same-version timestamps. Missing mappings and drift belong in the diagnostic/operator surface. Automatic repair requires explicit policy, authorization, idempotency, and audit evidence. Square subscription retrieval is the first implemented provider path.
