# Quota routing and scan recovery

The public dashboard shows Ready to scan and actual processing stages. It has no account-wide quota percentage, enforcement balance, reset counter or model controls. Availability checks coalesce into one request; remembered primary limits expire at UTC midnight. A remembered limit never prevents uploading to the backend.

The primary provider remains the default. Confirmed daily rejection 3036 is distinct from temporary capacity 3040 and ordinary rate limiting. The backend records the primary daily rejection and uses Gemini when its backend secret is configured. Temporary failures can use the backup without marking the primary exhausted. The same request stays with Gemini through verification. A new request returns to the primary after daily reset. Gemini account limits cannot be eliminated by the app.

Primary token estimates cannot reject a scan. Only successful primary usage contributes to its private ledger; backup tokens do not inflate it. A usable first OCR pass survives a failed verification request. The gateway hides provider metadata and failure details. A final failure leaves editing and Word export available and permits a deliberate retry without automatically duplicating an ambiguous network submission. Completed scanned PDF pages and their pictures remain cached while the same file stays open.

Run `node tests/ai-quota.cjs`, `node tests/gemini-fallback.cjs`, `node tests/automatic-upload.cjs` and `node tests/scan-resume.cjs`. Both deployment workflows run provider regression checks. Live credentials are checked only when a repository deployment secret is supplied; see AUTOMATIC_OCR_FALLBACK.md for secure activation.
