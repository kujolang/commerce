# Provider authoring

Register an adapter with a stable ID, semantic adapter version, every capability boolean, local validation, safe public projection, bounded provider calls, webhook verification, and normalization. Unsupported features must stay false and reject before mutation. Provider API shapes and secrets cannot cross the adapter boundary. Pin provider API versions where supported, return request IDs only to diagnostics, and run `assertProviderConformance()` plus request, timeout, signature, event, and injection tests.
