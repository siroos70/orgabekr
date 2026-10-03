

## Payment hardening
The callback state machine is monotonic: a paid order cannot be downgraded by a replayed cancellation callback, and repeated successful callbacks are idempotent. Payment initiation is rate-limited per forwarded client address. `PUBLIC_ORIGIN` is required and validated as an HTTPS origin in every environment; the server no longer trusts request Host headers for gateway callbacks. `/api/health` now pings the database and returns 503 until the database is reachable. `.gitignore` and `.dockerignore` exclude credentials and local artifacts, and the production container runs as the unprivileged Node user.
