import type {
  SupplierQuote,
  Supplier,
  QuoteScoreWeights,
} from "@typedefs/purchasing";
import { DEFAULT_SCORE_WEIGHTS } from "@typedefs/purchasing";

/**
 * Compute weighted scores for an array of quotes against the same RFQ line.
 * Each quote gets a score 0–1; higher is better. Returns the input array with
 * `weighted_score` and `is_recommended` set on each item.
 *
 * Components:
 *   • price            — 1.0 for cheapest, 0.0 for most expensive, linear
 *   • lead_time        — 1.0 for fastest, 0.0 for slowest, linear
 *   • supplier_rating  — rating (1-5) / 5
 *   • payment_terms    — 1.0 for terms ≥30 days, scales down
 *   • delivery_history — placeholder (1.0 unless backend provides on-time %)
 */
export function scoreQuotes(
  quotes: SupplierQuote[],
  suppliers: Record<string, Supplier>,
  weights: QuoteScoreWeights = DEFAULT_SCORE_WEIGHTS,
): SupplierQuote[] {
  if (quotes.length === 0) return [];

  const prices = quotes.map((q) => q.unit_price);
  const leadTimes = quotes.map((q) => q.lead_time_days ?? 999);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minLead = Math.min(...leadTimes);
  const maxLead = Math.max(...leadTimes);

  const normalise = (v: number, min: number, max: number) =>
    max === min ? 1 : (max - v) / (max - min); // lower-is-better → normalised 0-1

  const withScores = quotes.map((q) => {
    const sup = suppliers[q.supplier_id];
    const priceScore = normalise(q.unit_price, minPrice, maxPrice);
    const leadScore = normalise(q.lead_time_days ?? 999, minLead, maxLead);
    const ratingScore = sup ? (sup.rating ?? 3) / 5 : 0.6;
    const termsScore = sup
      ? Math.min(1, (sup.payment_terms_days ?? 30) / 30)
      : 0.5;
    const historyScore = 1; // TODO when backend tracks supplier on-time delivery

    const weighted =
      weights.price * priceScore +
      weights.lead_time * leadScore +
      weights.supplier_rating * ratingScore +
      weights.payment_terms * termsScore +
      weights.delivery_history * historyScore;

    return { ...q, weighted_score: Math.round(weighted * 1000) / 1000 };
  });

  // Mark the highest-scoring quote per rfq_line.
  const byLine: Record<string, SupplierQuote[]> = {};
  for (const q of withScores) {
    const k = q.rfq_line_id ?? "__line";
    (byLine[k] = byLine[k] || []).push(q);
  }
  for (const line of Object.values(byLine)) {
    line.sort((a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0));
    if (line[0]) line[0].is_recommended = true;
  }

  return withScores;
}
