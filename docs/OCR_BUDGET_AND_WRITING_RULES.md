# Daily OCR safety and writing exercises

Cloudflare documents 10,000 free neurons per account per UTC day. Paid Workers accounts can incur additional usage charges; a Free account does not automatically become Paid. Reset is 00:00 UTC (05:30 India time).
Reference: https://developers.cloudflare.com/workers-ai/platform/pricing/

PaperAI admits primary inference through the shared UsageTracker Durable Object with a 9,500-neuron application budget. Every call, including retries and verification, books at least 1,000 estimated neurons before starting. Larger text/output envelopes increase that booking. Completed requests reconcile against reported token usage. Failed calls, missing usage and interrupted requests retain their booking for the day. Concurrent pages share the same ledger. A booking that does not fit is denied; Gemini may continue, but a Gemini outage cannot bypass the primary cap. Missing/unavailable tracking fails closed for primary inference. This can switch to Gemini before displayed completed usage reaches 9,500.

This is a conservative application estimate, not a Cloudflare account billing control: other applications on the same account, image-token estimation, model-price changes and already-running requests remain outside an absolute cost guarantee. Gemini has its own quotas and billing. Do not represent either provider as unlimited or guaranteed free.

# Writing boxes

Reference examples (links only; no third-party worksheet copied):
- Kendriya Vidyalaya Garhwa holiday practice, including letter practice grids: https://cdnbbsr.s3waas.gov.in/s3kv0549bfd7b9681e8d1f90f6bea56c84/uploads/2025/05/2025050977.pdf
- Indian School Al Wadi Al Kabir alphabet recap: https://iswkoman.com/uploads/work-sheet/6853323-WORKSHEET%20-1%20VARNMALA%20RECAP%20-%20HINDI_3rd%20LANGUAGE.pdf

An explicit writing range can allocate empty exercise cells, without filling answers: A to Z = 26; क से ञ = 10; अ से औ = 11. Rows contain at most ten equal cells. Source-observed grids/answer spaces take precedence. Marks never determine alphabet count. Missing-letter exercises retain their original blanks. Ambiguous cross-vowel/consonant ranges, conjunct endpoints, Romanized endpoints such as “aa to nya”, Telugu and other language conventions require source evidence/teacher review; do not guess a universal alphabet size.

Existing GRID markers produce actual visible exercise cells in preview and Word, not invisible text layout boxes. No answer letters are inserted. Normal question text remains editable paragraphs. Keep source numbering and marks; report gaps, duplicates and inconsistent multiplication totals for review rather than fabricate omitted questions or award marks. Gemini receives the same rules while reading pixels; the app validates the supported deterministic ranges.
