// SM-2 (SuperMemo-2, 1987) — the classic spaced-repetition scheduling algorithm most "simple SRS"
// systems (including early Anki) are built on. Pure functions only, no storage/DOM — see
// src/srs/store.js for where a card's state actually lives, and src/srs/queue.js for turning a
// deck's kanji list + this user's stored states into an actual session queue.
//
// Day-granularity throughout: `dueDate` is a plain YYYY-MM-DD string (todayISO()), not a
// timestamp — SM-2 schedules in whole days, and comparing date strings directly (`due <= today`)
// is simpler and less error-prone than juggling Date objects/timezones for something that was never
// meant to be more precise than "which calendar day."

export const EASE_FACTOR_FLOOR = 1.3
const DEFAULT_EASE_FACTOR = 2.5

// A 4-button grader (Again/Hard/Good/Easy — the same vocabulary Anki uses) mapped onto SM-2's own
// 0–5 recall-quality scale. SM-2 only actually cares about two thresholds — quality < 3 is a fail
// (resets the card), quality >= 3 is a pass with a graduated ease adjustment — so this mapping
// deliberately skips qualities 1–2 (no clean button maps to "recalled, but it felt like a
// blackout") and picks one representative value per button instead of exposing the full 6-point
// scale to a learner. Same simplification most modern SM-2-derived flashcard apps make.
export const GRADE = { AGAIN: 0, HARD: 3, GOOD: 4, EASY: 5 }

export function todayISO(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

// A card that's never been reviewed — `dueDate: null` reads as "always due" everywhere this module
// (and queue.js's own due-filter) checks due-ness, so a brand-new kanji needs no special-casing
// beyond starting here.
export function newCardState() {
  return { interval: 0, easeFactor: DEFAULT_EASE_FACTOR, repetitions: 0, dueDate: null }
}

export function isDue(state, today = todayISO()) {
  return !state.dueDate || state.dueDate <= today
}

// The actual SM-2 update — given a card's current state and a grade (one of GRADE's values, though
// any 0–5 quality works), returns the NEXT state. Formula is verbatim SM-2 (SuperMemo's own 1987
// spec): a failed recall (quality < 3) resets repetitions and drops the card back to a 1-day
// interval; a pass grows the interval (1 day → 6 days → interval*easeFactor, in that order as
// repetitions accumulate) and nudges easeFactor by a curve that rewards easy recalls and punishes
// effortful ones, floored at EASE_FACTOR_FLOOR so a hard card can't spiral toward ever-shorter
// intervals forever.
export function schedule(state, quality, today = todayISO()) {
  let { interval, easeFactor, repetitions } = state

  if (quality < 3) {
    repetitions = 0
    interval = 1
  } else {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * easeFactor)
    repetitions += 1
  }

  easeFactor = Math.max(
    EASE_FACTOR_FLOOR,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  )

  const due = new Date(today)
  due.setDate(due.getDate() + interval)

  return { interval, easeFactor, repetitions, dueDate: todayISO(due) }
}
