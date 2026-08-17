export type Water = 'river' | 'canal' | 'coast'

// "Worst first" only means something among waters that behave alike. A canal
// reach is held at its level by locks and a Baltic gauge follows the wind, so
// ranking them against the Rhine buries the story: on 15 August 2003 — the
// worst drought in the record — nine of the ten most extreme gauges were on
// the Baltic and four were canals, and not one big river appeared at the top.
const CANAL = /KANAL|WASSERSTRA(?:SS|ß)E|SCHIFFAHRTSWEG|FAHRT$/
const COAST = /OSTSEE|NORDSEE|HAFF|BODDEN|F(?:Ö|OE)RDE|WATT|ELBE-?M(?:Ü|UE)NDUNG/

/** Canal first: the Nord-Ostsee-Kanal is a canal, whatever its name contains. */
export function waterType(water: string): Water {
  const name = water.toUpperCase()
  if (CANAL.test(name)) return 'canal'
  if (COAST.test(name)) return 'coast'
  return 'river'
}

export const WATER_LABEL: Record<Water, string> = {
  river: 'Flüsse',
  canal: 'Kanäle',
  coast: 'Küste',
}

/** Why a group behaves differently, said once above the list rather than never. */
export const WATER_NOTE: Record<Water, string | null> = {
  river: null,
  canal: 'Kanäle werden durch Schleusen auf Niveau gehalten. Schwankungen sind meist Betrieb, nicht Wetter.',
  coast: 'An der Küste bewegt der Wind das Wasser, nicht der Regen der letzten Wochen.',
}
