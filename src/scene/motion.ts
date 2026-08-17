const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Whether the reader has asked for less movement.
 *
 * The CSS media query only reaches CSS. Everything that actually moves here is
 * driven from JavaScript or a shader: the camera drifts on its own ten seconds
 * after the last input, flies for seconds at a time on every selection, and
 * the rivers carry a travelling pulse that never stops. None of that is
 * pausable, so for anyone with a vestibular disorder the app is currently
 * unusable — and WCAG 2.2.2 asks for a way to stop it.
 *
 * Read live rather than cached: the setting can change while the page is open.
 */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches
}

/** A flight duration in seconds, or an instant cut when motion is unwelcome. */
export function flightSeconds(seconds: number): number {
  return reducedMotion() ? 0 : seconds
}

/** Run `listener` whenever the preference changes, so the scene can react. */
export function onMotionPreferenceChange(listener: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {}
  const mq = matchMedia(QUERY)
  mq.addEventListener('change', listener)
  return () => mq.removeEventListener('change', listener)
}
