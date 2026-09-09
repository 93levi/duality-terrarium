# kanji-schema

Not started. Will hold the shared type definitions — `Kanji`, `Component`, `StrokeGroup` — used by
both `data-pipeline/export/` (what it writes) and `apps/web/src/data/` (what it reads), so the two
can't drift out of sync silently.

Define this once `data-pipeline/export/` has a real shape to describe (end of Phase 0/1) — writing
it earlier is guessing.
