# Live editor and saved paper

The desktop home screen includes a clearly labelled example question paper. The existing extracted paper preview remains the editing reference; it approximates Word layout, not an exact Word pagination renderer.

Teach edits, applied suggestions, Undo/Redo and Original update the canonical paper immediately. Preview, copy and Word export use that same text. Edits save after 400 ms idle to one IndexedDB draft with source media and document metadata. Reopening the site offers Resume saved paper; a new upload replaces the single draft. Clear data removes it. This is local browser storage, not account sync or guaranteed storage; failures are shown beside the editor and do not stop editing. Browser termination before a pending transaction finishes may lose the last keystrokes.

Done closes the editor. Remember corrections is a separate explicit action for the existing local spelling dictionary; autosave does not train or automatically learn corrections.

Typing and selection request debounced, cached contextual suggestions. A long line falls back to its current word instead of disabling suggestions. Up to eight distinct faithful alternatives are accepted, with fewer allowed when evidence is limited. Numbers and equations remain protected. Suggestions never apply themselves. Translation defaults to the detected document script on first open; choosing a target is explicit and translation changes only the selected range after choosing a result. Edit selection bridges an unambiguous selected preview phrase into Teach; repeated/ambiguous text requires the exact editor selection.

Browser smoke tests cover four widths, autosave/reload with five original picture assets, default language, automatic suggestion display, Undo/Redo, updated DOCX bytes, action alignment and overflow. Model calls are stubbed in these UI tests; live provider quality depends on the configured model and quotas.
