// Selectable demo characters for the pipeline-visualization dev tool (main.js's
// mountPipelineDemoScreen shows a picker built off PIPELINE_DEMO_CHARACTERS below; viewer/
// pipelineDemo.js's playCharacter(id) runs whichever one gets picked). Deliberately a small fixed
// set, not a live search — see apps/web/CLAUDE.md's own section on this tool for why.
//
// Every character's stroke order is hand-extracted directly from KanjiVG's own raw source
// (data-pipeline/kanjivg-source/kanji/<codepoint>.svg), NOT from the shipped apps/web/public/data/
// bundle — that export step drops each stroke's own kvg:sN id/number entirely (only `d` survives),
// and separately, its own tree-flattening order does NOT reliably match true kvg:sN numeric order
// (confirmed directly on 海's own bundle: its 毎-group s4/s5 pair comes out reversed). Every entry
// below is verified against its own source file's embedded <g id="kvg:StrokeNumbers_...">
// layer — the literal numbered labels KanjiVG draws for humans — not just assumed from element
// order.
//
// 海 was the original pick (still first/default): a genuine two-part split, both roles present
// (氵=meaning, 毎=sound), 9 strokes, already this project's own running example throughout its docs.
// 鬱/闇/霧 added for real variety, by explicit request — deliberately NOT all the same shape of
// example:
// - 鬱 ("gloom") — 29 strokes, genuinely ONE region: KanjiVG names real sub-elements deep inside it
//   (缶/木/木/冖/鬯/彡...), but this project's own classifier calls it irregular regardless (no clean
//   two-part split at the TOP level, which is the only level that counts) — the single most complex
//   common example this app's own dataset has, and an honest one: shown as one whole-character
//   region here too, same as the real app would, not a fake split invented for the demo.
// - 闇 ("dark") — 17 strokes, a real two-part split, but a different SHAPE of one than 海's left/
//   right: 門 wraps 音 (kamae, an enclosure), not a side-by-side pair.
// - 霧 ("fog") — 19 strokes, a real two-part split again, this time top/bottom (雨 over 務) rather
//   than left/right or an enclosure — also already a familiar name in this app (track 4's own title
//   in RADIO_PLAYLIST, main.js).
export const PIPELINE_DEMO_CHARACTERS = [
  {
    id: 'umi',
    character: '海',
    gloss: 'sea',
    groups: [
      { element: '氵', position: 'left', role: 'meaning' },
      { element: '毎', position: 'right', role: 'sound' },
    ],
    strokes: [
      { group: 0, type: '㇔', d: 'M20.38,14.75c3.31,1.47,8.54,6.05,9.37,8.34' },
      { group: 0, type: '㇔', d: 'M14.75,39.5c3.79,1.15,9.8,4.72,10.75,6.5' },
      { group: 0, type: '㇀', d: 'M13.75,89.21C16,90,17.06,89.57,18,87.95c2.75-4.7,5.5-10.45,8-16.45' },
      { group: 1, type: '㇒', d: 'M53,11c0.12,1.68-0.19,3.03-0.83,4.57C49.7,21.44,43.05,31.26,37.75,37' },
      {
        group: 1,
        type: '㇐',
        d: 'M51.13,24.03c0.94,0.29,3.67,0.41,4.6,0.29c7.65-0.94,18.52-3.07,26.02-4.84c1.51-0.36,3.5-0.36,4.29-0.21',
      },
      {
        group: 1,
        type: '㇛',
        d: 'M48.96,36.12C50,37,50.5,38.25,49.75,42.25C47.86,52.35,42.98,67.88,40,73c-1.75,3-0.5,4.43,1.5,4.5c14.75,0.5,31.22,2.68,44.24,10c2.04,1.15,3.97,2.39,5.76,3.75',
      },
      {
        group: 1,
        type: '㇆a',
        d: 'M50.78,37.57c6.97-0.07,24.47-2.7,30.7-3.57c2.51-0.35,3.96,0.99,3.79,3.12C84,52.75,77.33,84.33,73.95,92.43c-2.95,7.07-6.12,0.35-7.12-0.77',
      },
      { group: 1, type: '㇑a', d: 'M64.75,39.75c0.88,0.88,1.22,2.74,1,4c-1.5,8.5-5.5,25.75-8.25,33.75' },
      {
        group: 1,
        type: '㇐',
        d: 'M30.63,58.98c1.85,0.45,5.24,0.61,7.09,0.45c16.91-1.43,37.36-3.68,55.69-4.15c3.08-0.08,4.93,0.21,6.47,0.44',
      },
    ],
  },
  {
    id: 'utsu',
    character: '鬱',
    gloss: 'gloom',
    // No real top-level split — see this file's own header comment for why. One group, no
    // position/role (nothing to label a side with when there isn't one).
    groups: [{ element: '鬱', position: null, role: null }],
    strokes: [
      { group: 0, type: '㇒', d: 'M48.3,10.89c0.02,0.26,0.04,0.66-0.04,1.03c-0.49,2.16-3.33,6.91-7.22,9.82' },
      {
        group: 0,
        type: '㇐',
        d: 'M47.11,16.35c0.31,0.13,0.88,0.15,1.19,0.13c3.8-0.35,9.58-1.17,12.99-1.61c0.51-0.07,0.83,0.06,1.08,0.12',
      },
      {
        group: 0,
        type: '㇐',
        d: 'M40.26,24.54c0.5,0.18,1.42,0.21,1.92,0.18c5.22-0.3,15.2-1.82,22.82-1.89c0.83-0.01,1.34,0.08,1.75,0.17',
      },
      { group: 0, type: '㇑', d: 'M53.11,16.58c0.31,0.45,0.66,0.78,0.66,1.4c0,2.18-0.03,15.57-0.08,17.41' },
      {
        group: 0,
        type: '㇄',
        d: 'M44.2,29.3c0.25,0.15,0.5,0.77,0.5,1.07c-0.02,1.85-0.02,1.1,0,4.61c0,0.68-0.12,1.34,0.5,1.24c1.71-0.29,13.7-1.9,16.84-1.99',
      },
      { group: 0, type: '㇑', d: 'M63.35,27.91c0.25,0.15,0.54,1.11,0.5,1.4c-0.25,1.82-0.5,3.19-0.91,6.57' },
      {
        group: 0,
        type: '㇐',
        d: 'M14.87,19.27c0.52,0.09,2.1,0.08,3.49,0c4.88-0.26,11.48-0.71,16.71-0.88c0.89-0.03,1.94-0.31,3.31-0.18',
      },
      { group: 0, type: '㇑', d: 'M28.06,10.34c0.59,0.23,0.94,1.06,1.06,1.53c0.12,0.47,0,23.55-0.12,26.49' },
      { group: 0, type: '㇒', d: 'M29.4,20.03c-2.67,4.49-10.61,12.03-16.15,14.57' },
      { group: 0, type: '㇏', d: 'M31.28,23.22c2.12,1.2,4.39,3.61,5.6,5.72' },
      {
        group: 0,
        type: '㇐',
        d: 'M68.83,18.29c0.33,0.12,1.06,0.18,1.95,0.12c3.15-0.24,12.6-1.06,18.75-1.65c0.89-0.08,1.67-0.12,2.23,0',
      },
      { group: 0, type: '㇑', d: 'M77.1,10.4c0.59,0.23,0.94,1.06,1.06,1.53c0.12,0.47,0,21.26-0.12,24.2' },
      { group: 0, type: '㇒', d: 'M78.07,18.62c-1.53,4.22-6.28,10.08-9.83,12.25' },
      {
        group: 0,
        type: '㇏',
        d: 'M78.02,18.54c3.84,4.51,9.99,10.29,13.1,12.07c0.89,0.51,1.39,0.86,2.13,1.03',
      },
      { group: 0, type: '㇔', d: 'M19.16,41.13c0,2.91-3.72,10.92-5.41,12.87' },
      {
        group: 0,
        type: '㇆',
        d: 'M18.99,44.24c9.51-0.99,60.24-3.03,67.95-3.4C99,40.25,89.5,48,86.5,50.11',
      },
      {
        group: 0,
        type: '㇒',
        d: 'M44.91,49.53c0.05,0.47,0.27,1.29-0.1,1.9C42.5,55.25,34.5,65,27.1,69.61',
      },
      { group: 0, type: '㇔', d: 'M29.57,52.91c5.7,2.95,14.71,12.14,16.14,16.74' },
      { group: 0, type: '㇔', d: 'M33.78,47.58c1.41,0.79,3.63,3.24,3.99,4.47' },
      { group: 0, type: '㇔', d: 'M26.71,56.64c1.41,0.88,3.63,3.6,3.99,4.97' },
      { group: 0, type: '㇔', d: 'M45.7,58.3c1.14,0.79,2.95,3.24,3.24,4.47' },
      { group: 0, type: '㇔', d: 'M35.51,65.78c1.19,0.56,3.07,2.31,3.37,3.18' },
      {
        group: 0,
        type: '㇄a',
        d: 'M19.46,53.75c0.32,0.2,0.86,0.97,0.86,1.94c0,0.41,1.67,16.44,1.64,17.41c-0.03,0.96,0.29,1.65,1.35,1.54c5.9-0.57,25.29-1.48,28.67-1.68',
      },
      { group: 0, type: '㇑', d: 'M52.64,51.99c0.62,0.28,1.08,0.85,1.08,1.94c0,2.18-0.21,11.43-0.95,21.2' },
      {
        group: 0,
        type: '㇒',
        d: 'M46.74,79.93c0.17,0.18,0.28,0.72-0.17,1c-2.9,1.83-12.86,6.87-22.25,8.73',
      },
      {
        group: 0,
        type: '㇟',
        d: 'M21.46,79.82c0.59,0.56,0.63,0.93,0.83,1.67c0.2,0.75-0.04,8.93-0.04,11.26c0,5.99,7.88,5.06,14.59,5.06c5.2,0,9.54-0.32,11.5-1.99c1.96-1.67,1.72-3.62,1.92-5.3',
      },
      {
        group: 0,
        type: '㇒',
        d: 'M80.11,50.75c0.06,0.34,0.22,0.92-0.12,1.36C77,56,71.25,60.25,59.75,64.63',
      },
      {
        group: 0,
        type: '㇒',
        d: 'M85.67,64.39c0.08,0.4,0.28,1.09-0.15,1.61c-2.95,3.51-16.27,11.5-27.03,15.37',
      },
      {
        group: 0,
        type: '㇒',
        d: 'M91.3,79c0.1,0.47,0.2,1.22-0.18,1.9C88.85,84.89,75.86,93.64,58.07,99',
      },
    ],
  },
  {
    id: 'yami',
    character: '闇',
    gloss: 'dark',
    groups: [
      { element: '門', position: 'kamae', role: 'meaning' },
      { element: '音', position: null, role: null },
    ],
    strokes: [
      {
        group: 0,
        type: '㇑',
        d: 'M19.14,15.54c0.73,0.96,0.98,2.84,0.93,4.15c-0.02,0.65-0.01,46.03,0,66.56c0,5.82,0.01,9.64,0.01,9.88',
      },
      {
        group: 0,
        type: '㇕a',
        d: 'M21.27,17.08c2.09-0.09,13.46-1.99,18.1-2.6c2.7-0.36,4.58,0.05,4.55,3.03c-0.03,3.46-0.04,12.08-0.05,17.37c0,2.47,0,4.21,0,4.38',
      },
      { group: 0, type: '㇐a', d: 'M21.2,27.39c6.55-0.89,14.42-1.89,21.63-2.51' },
      { group: 0, type: '㇐a', d: 'M21.02,38.98c8.11-1.15,14.64-2.03,21.81-2.56' },
      {
        group: 0,
        type: '㇑',
        d: 'M63.69,13.26c0.44,0.55,0.89,1.48,0.88,2.73c-0.02,8.11-0.05,13.69-0.05,18.14c0,1.55,0,2.96,0.01,4.29',
      },
      {
        group: 0,
        type: '㇆a',
        d: 'M65.3,14.66c2.16-0.09,15.31-2.11,20.31-2.73c3.09-0.39,4.61,0.16,4.6,3.45c-0.09,22.88-0.09,62.81-0.09,76.5c0,10.56-6.07,2.22-7.52,0.93',
      },
      { group: 0, type: '㇐a', d: 'M65.74,24.97c5.88-0.72,16.38-1.72,22.9-1.99' },
      { group: 0, type: '㇐a', d: 'M65.8,36.26c6.57-0.63,15.45-1.63,22.8-1.81' },
      {
        group: 1,
        type: '㇑a',
        d: 'M53.45,41.49c0.8,0.63,0.96,1.73,0.9,2.58c-0.09,1.3,0.03,2.05-0.07,4.25',
      },
      {
        group: 1,
        type: '㇐',
        d: 'M36.72,50.47c1.94,0.22,3.56,0.4,5.53,0.23C47.63,50.24,56.31,49,66,47.82c1.98-0.24,3.5-0.2,5.42,0.06',
      },
      { group: 1, type: '㇔', d: 'M42.75,54c2.98,2.21,3.6,4.33,4.02,5.88' },
      {
        group: 1,
        type: '㇒',
        d: 'M64.41,51.24c0.09,0.89-0.16,1.67-0.56,2.5c-1.07,2.26-2.39,4-3.09,5.21',
      },
      {
        group: 1,
        type: '㇐',
        d: 'M31.34,63.88c2.37,0.52,4.66,0.35,7.03,0c11.76-1.76,23.5-2.75,32.26-3.37c2.39-0.17,5.28-0.64,7.53,0.38',
      },
      {
        group: 1,
        type: '㇑',
        d: 'M42.02,69.76c0.62,1.02,0.88,2.1,0.77,3.24c0,4.69-0.02,11.02-0.03,15.37c-0.01,2.09-0.01,3.73-0.01,4.5',
      },
      {
        group: 1,
        type: '㇕a',
        d: 'M43.42,71.02c1.87-0.19,14.19-1.67,18.61-2.4c2.9-0.48,4.21-0.49,4.16,2.87c-0.05,3.28-0.06,9.09-0.06,15.38c0,1.65,0,3.33,0,5',
      },
      { group: 1, type: '㇐a', d: 'M44.06,80.75c4.32-0.37,17.71-2,21-2.17' },
      { group: 1, type: '㇐a', d: 'M44.18,90.3c6.19-0.55,15.06-1.93,20.63-2.22' },
    ],
  },
  {
    id: 'kiri',
    character: '霧',
    gloss: 'fog',
    groups: [
      { element: '雨', position: 'top', role: 'meaning' },
      { element: '務', position: 'bottom', role: 'sound' },
    ],
    strokes: [
      {
        group: 0,
        type: '㇐',
        d: 'M34.16,12.56c2.47,0.44,5.04,0.4,7.72,0.14c7.26-0.72,20.02-2.13,26.62-2.48c2.01-0.11,4.07-0.26,6.06,0.02',
      },
      { group: 0, type: '㇔/㇑', d: 'M17.93,25.17c-0.26,5.08-2.57,10.71-4.28,15.84' },
      {
        group: 0,
        type: '㇖b/㇆',
        d: 'M18.85,26.82c8.27-0.95,56.84-5.34,72.55-5.34c9.1,0,1.17,6.33-0.28,7.93',
      },
      {
        group: 0,
        type: '㇑',
        d: 'M53.17,15.07c0.91,1.36,1.31,2.26,1.33,3.6c0,0.23-0.01,10.96-0.02,17.71c0,3.03-0.01,5.26-0.01,5.38',
      },
      { group: 0, type: '㇔', d: 'M36,30.43c2.99,0.68,7.08,2.71,8.71,3.83' },
      { group: 0, type: '㇔', d: 'M33.12,38.5c2.96,0.68,7.53,3.19,9.15,4.33' },
      { group: 0, type: '㇔', d: 'M67,27.68c3.56,0.93,7.6,2.79,9.03,3.57' },
      { group: 0, type: '㇔', d: 'M67.54,36.23c2.91,0.79,6.87,3.15,8.45,4.46' },
      {
        group: 1,
        type: '㇇',
        d: 'M17.39,51.44c1.99,0.78,4.21,0.52,6.25,0.2c4.98-0.79,16.82-2.97,18.69-3.22c2.22-0.3,2.73,1.51,1.4,2.48c-2.27,1.67-8.96,7.57-10.36,8.76',
      },
      { group: 1, type: '㇔', d: 'M26.75,56.88c2.05,0.68,7.34,3.28,8.31,5.04' },
      {
        group: 1,
        type: '㇇a',
        d: 'M11.23,66.87c2.5,0.6,4.56,0.65,7.14,0.31c7.1-0.94,19.86-3.23,25.13-4.07c11.25-1.8,2,5.15-0.5,6.92',
      },
      {
        group: 1,
        type: '㇁',
        d: 'M32.6,66.9c1,1,1.26,2.25,1.27,3.6c0.05,6.06-0.06,13.16-0.06,23.73c0,8.91-5.05,1.11-6.66,0.56',
      },
      {
        group: 1,
        type: '㇒',
        d: 'M31.73,66.21c0.1,1.06-0.5,2.03-0.99,2.91c-3.59,6.46-8.64,14.09-19.99,22.59',
      },
      {
        group: 1,
        type: '㇒',
        d: 'M61.77,44.33c0.06,0.94-0.04,1.53-0.39,2.42c-1.35,3.52-3.98,9.39-7.84,13.61',
      },
      {
        group: 1,
        type: '㇐',
        d: 'M62.63,51.15c1.5-0.03,2.81-0.18,3.66-0.3c4.06-0.61,9.91-2.31,13.85-3.18c1.12-0.25,2.44-0.45,3.6-0.18',
      },
      {
        group: 1,
        type: '㇒',
        d: 'M75.48,52.71c0,1.04-0.24,1.75-0.82,2.59C70.12,61.88,63.62,67,51.9,72.93',
      },
      {
        group: 1,
        type: '㇏',
        d: 'M59.01,57c4.7,0.62,16.91,7.77,26.15,11.56c2.5,1.03,4.99,1.65,7.59,2.35',
      },
      {
        group: 1,
        type: '㇆',
        d: 'M53.55,79.89c1.49,0.55,3.92,0.44,5.44,0.22c5.73-0.82,14.98-2.36,19.25-2.88c2.81-0.35,4.74-0.12,3.96,3.2c-0.92,3.97-3.07,9.62-6.62,15c-2.34,3.54-4.55,0.13-5.36-0.29',
      },
      {
        group: 1,
        type: '㇒',
        d: 'M68.1,69.71c0.06,0.71,0.16,1.84-0.13,2.86c-2.11,7.55-8.23,21.56-22,27.37',
      },
    ],
  },
]
