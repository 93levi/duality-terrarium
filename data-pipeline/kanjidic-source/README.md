# kanjidic-source

[KANJIDIC2](http://www.edrdg.org/wiki/index.php/KANJIDIC_Project) — EDRDG, CC BY-SA. Lexical data
only (readings, English meanings, classification codes) — **no stroke geometry**, its `stroke_count`
field is a bare integer. Complements KanjiVG (pure geometry, no meanings); neither replaces the
other. See root `CLAUDE.md` Data source section.

Gitignored — fetch from `http://www.edrdg.org/kanjidic/kanjidic2.xml.gz`, gunzip in place:

```bash
curl -sSL -o kanjidic2.xml.gz http://www.edrdg.org/kanjidic/kanjidic2.xml.gz
gunzip -k kanjidic2.xml.gz
```

`data-pipeline/gloss/build_gloss_index.py` reads `kanjidic2.xml` from here.
