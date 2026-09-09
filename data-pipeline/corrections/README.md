# corrections/

Hand-authored overrides on top of `enrich/`'s mechanical dial verdict, in `overrides.json`.

This is the escape hatch for the residual cases the dial genuinely can't resolve — see
`data-pipeline/CLAUDE.md` and `enrich/README.md` for how we got here. Two kinds of entry:

- **`component_overrides`** — a decision about one element name, applied everywhere it appears
  (e.g. 毎: real-world usage far exceeds its corpus-structural frequency, so force it useful
  regardless of what the dial's threshold says).
- **`pair_overrides`** — a decision about one specific parent→child relationship, *not* the child
  element in general (e.g. 目 inside 貝 is a coincidental shape-match and should be excluded, but
  目 elsewhere — as its own real "eye" component in other characters — is unaffected).

**Rule:** never hand-edit `enrich/out/*.json` directly to fix a wrong verdict — add an entry here
instead, and re-run `enrich/classify.py`. That keeps the whole pipeline rerunnable from a clean
KanjiVG source at any time, and keeps every fix documented with *why*, not just *what changed*.

New entries should read like the two examples already here: one or two sentences of concrete
reasoning, not just a bare true/false.
