import { useMemo } from 'react'
import { isUnusual } from '../data/unusual'
import { useServices } from '../services'
import { useApp } from '../store'
import { unusual } from '../tokens'
import { useQuantizedTime } from './useQuantizedTime'

export interface Counts {
  low: number
  high: number
  placed: number
}

/**
 * How many gauges sit outside their normal band at the chosen moment.
 *
 * Shared, because the same three numbers are the status line for a sighted
 * reader and the map's entire text alternative for everyone else — and they
 * must not be able to disagree.
 */
export function useCounts(): Counts | null {
  const simTime = useQuantizedTime()
  const stations = useApp((s) => s.stations)
  const services = useServices()

  return useMemo(() => {
    if (!services) return null
    const { timeline } = services
    let low = 0
    let high = 0
    let placed = 0
    for (let i = 0; i < stations.length; i++) {
      const sample = timeline.sample(i, simTime)
      if (!sample || Number.isNaN(sample.state)) continue
      placed++
      if (!isUnusual(sample.state)) continue
      if (sample.state <= unusual.low) low++
      else high++
    }
    return { low, high, placed }
  }, [services, stations, simTime])
}
