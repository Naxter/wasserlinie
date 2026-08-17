import { unusual } from '../tokens'

/**
 * Whether a reading is far enough from normal to be worth pointing at.
 *
 * The thresholds are p10 and p90 of this gauge's own record for this date, so
 * "unusual" means one year in ten either way — the same boundary the legend
 * draws its dividing lines on.
 */
export function isUnusual(state: number): boolean {
  return state <= unusual.low || state >= unusual.high
}
