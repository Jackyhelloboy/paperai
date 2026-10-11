# Automatic upload workflow

Selecting or dropping supported files starts processing immediately. Image and scanned PDF pages use the existing visual OCR, border detection and original-picture crop pipeline. Embedded PDF text and Word objects retain their native import paths. Successful processing opens the A4 preview and Editable Word export; no blank-paper creation, manual structure insertion or Extract click is required.

Visible header labels choose the measured science, humanities or worksheet reference family. Other scans use the compact reference. The selector resets font, spacing, indent, grid height and page-number defaults for every document. Question topics do not select a subject format, and the original text, numbering, marks, blanks, matching order and structure markers remain unchanged. Original Word formatting and measured native PDF geometry take precedence over inferred defaults. Review and corrections remain optional.

Only one upload processes at a time. File selection, removal and language changes are disabled during the active job, and repeated requests are ignored. A failed scan displays Retry / resume processing. Completed scanned PDF pages remain cached for the same open File and language. Results from another document are never presented as the failed scan. Clearing a file also clears its result and media.

Processing duration is unknown, so the indicator displays actual stages and an indeterminate animation, then 100% after the preview is ready. It respects reduced-motion preferences. A prior completion timer cannot hide a new upload's progress.

The quota bar uses a separate confirmed-pause state: a full red bar labelled **Free AI paused until reset**. This does not claim that analytics reported 10,000 used. When scanning is unblocked, the percentage and remaining count are derived from the current-day reported total and daily reference, rather than trusting inconsistent snapshot percentages. Missing analytics show no numeric percentage. Provider rejection still overrides delayed analytics; the app does not enable paid models or evade the provider limit.

Run `node tests/automatic-upload.cjs`, `node tests/ai-quota.cjs` and `node tests/reference-formats.cjs`, plus the import/export regression suites in the deployment workflow. Automatic workflow tests stub the AI boundary; they do not certify unseen handwriting or guarantee recovery of a picture absent from the uploaded source. Uncertain OCR and missing source pictures still require review rather than fabricated content.
