import { isDue } from './sm2.js'

// Turns a deck's static kanji list (e.g. one Genki lesson's entries from
// src/data/genki/genkiKanji.json) + this user's stored card states (store.js's getCardsForDeck)
// into today's actual review queue — new cards (no state yet) first, then cards whose stored
// dueDate has arrived, each group shuffled independently so recall is tested against genuine
// random encounter order rather than the textbook's own introduction order (which a learner would
// otherwise just pattern-match against instead of actually recalling each character on its own).
//
// `deckEntries` — array of { kanji, ... } (genkiKanji.json's own per-lesson shape works directly).
// `cardStates` — Map<kanji, CardState|null>, as returned by store.js's getCardsForDeck.
// Returns the filtered/shuffled subset of `deckEntries` that's actually due right now.
export function buildQueue(deckEntries, cardStates, today) {
  const fresh = []
  const due = []
  for (const entry of deckEntries) {
    const state = cardStates.get(entry.kanji) ?? null
    if (state === null) fresh.push(entry)
    else if (isDue(state, today)) due.push(entry)
  }
  return [...shuffle(fresh), ...shuffle(due)]
}

function shuffle(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
