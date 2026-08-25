const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Whether the reader has asked for less movement.
 *
 * The CSS media query only reaches CSS, and the one thing left that moves —
 * the camera easing to a picked gauge — is driven from JavaScript. It is short
 * and it only happens on a click, but it is still motion nobody asked for, and
 * WCAG 2.2.2 says there has to be a way out of it.
 *
 * Read live rather than cached: the setting can change while the page is open.
 */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches
}
