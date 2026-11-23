/**
 * Copy for the hand-written golden traces. Kept in the UI, not the data
 * contract: titles and blurbs are presentation, and a harness run has none.
 */
export const GOLDEN_COPY: Record<string, { title: string; blurb: string }> = {
  'g-injection': {
    title: 'Falls for prompt injection',
    blurb:
      'A note hidden in a customer email asks for a refund on someone else’s order. The agent complies.',
  },
  'g-silent': {
    title: 'Catches a silent failure',
    blurb:
      'The refund service reports success but writes nothing. The verifier re-checks the order, retries once and confirms.',
  },
  'g-stale': {
    title: 'Escalates on stale data',
    blurb:
      'The order DB says shipped, the carrier says returned to sender. The agent escalates instead of guessing.',
  },
}

export const FEATURED_REPLAY_ID = 'g-injection'
