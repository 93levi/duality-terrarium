# kanjivg-source

Not vendored yet. This holds a raw, untouched copy of [KanjiVG](https://github.com/KanjiVG/kanjivg)
(CC BY-SA licensed SVG stroke-order data) once it's fetched — gitignored, since it's third-party data
regenerable from upstream rather than something to commit wholesale.

Fetch it from the KanjiVG GitHub releases page (a zip of all character SVGs) or `git clone` the repo
directly. Whichever way, do it deliberately (it's a real download, not a routine `npm install`) and
drop the SVGs straight in this folder — `extract/` expects to read them from here.
