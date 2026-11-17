'use client'

// AZIMARA RELAY — Motion & Haptics engine.
//
// One system drives every animation and tactile response in the product:
//  - Tokens: durations, easings and spring presets shared by CSS + JS.
//  - Haptics: the Vibration API wrapped in semantic patterns. Haptics only
//    fire on devices that implement navigator.vibrate (Android Chrome/Firefox;
//    iOS Safari has no web vibration API), only after the session-level
//    preference is ON, and never when the OS asks for reduced motion.
//  - Preference store: localStorage-backed, subscribable so the settings view
//    and every consumer stay in sync without a state library.
//
// Production rules encoded here:
//  - Reduced motion is respected at BOTH layers (CSS media query + JS check).
//  - Vibration calls are wrapped in try/catch — some browsers throw on
//    malformed patterns or behind disabled permissions.
//  - Timers/observers created by helpers must be cleaned up by callers.

export const MOTION = {
  duration: {
    instant: 80,   // state flips: toggle, badge swap
    fast: 160,     // micro: hover lift, press, tooltip
    base: 240,     // standard transitions: dropdowns, sheets
    slow: 420,     // macro: view enter, dialog, hero settle
    cinematic: 700, // hero scenes, 3D settle
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',     // fast out, gentle settle
    decelerate: 'cubic-bezier(0.16, 1, 0.3, 1)', // expo-out — entrances
    accelerate: 'cubic-bezier(0.5, 0, 0.75, 0.4)', // exits
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // slight overshoot — playful
    emphasized: 'cubic-bezier(0.3, 0, 0.24, 1)', // macro choreography
  },
} as const

// ─── Preference store ───────────────────────────────────────────────────────

export type MotionPrefs = {
  animations: boolean   // master switch for decorative motion
  haptics: boolean      // vibration feedback (no-ops on unsupported devices)
  depth: boolean        // 3D tilt / parallax layers
}

const STORAGE_KEY = 'azimara.motion.v1'

const DEFAULT_PREFS: MotionPrefs = { animations: true, haptics: true, depth: true }

type Listener = (prefs: MotionPrefs) => void

let cache: MotionPrefs | null = null
const listeners = new Set<Listener>()

function readPrefs(): MotionPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  if (cache) return cache
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<MotionPrefs>
    cache = {
      animations: parsed.animations ?? DEFAULT_PREFS.animations,
      haptics: parsed.haptics ?? DEFAULT_PREFS.haptics,
      depth: parsed.depth ?? DEFAULT_PREFS.depth,
    }
  } catch {
    return DEFAULT_PREFS
  }
  return cache
}

function writePrefs(next: MotionPrefs) {
  cache = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode / storage disabled: prefs stay session-only.
  }
  listeners.forEach((l) => l(next))
  // Reflect the master switch on <html> so CSS can gate decorative layers
  // without waiting for React — mirrors how dark mode toggles a class.
  document.documentElement.classList.toggle('motion-off', !next.animations)
  document.documentElement.classList.toggle('depth-off', !next.depth)
}

export function getMotionPrefs(): MotionPrefs {
  return readPrefs()
}

export function setMotionPref<K extends keyof MotionPrefs>(key: K, value: MotionPrefs[K]) {
  const next = { ...readPrefs(), [key]: value }
  writePrefs(next)
}

export function subscribeMotionPrefs(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Apply stored prefs to <html> once at boot (called from the root shell). */
export function hydrateMotionPrefs() {
  if (typeof document === 'undefined') return
  const p = readPrefs()
  document.documentElement.classList.toggle('motion-off', !p.animations)
  document.documentElement.classList.toggle('depth-off', !p.depth)
}

// ─── Reduced motion ─────────────────────────────────────────────────────────

let reducedQuery: MediaQueryList | null = null
const reducedListeners = new Set<(reduced: boolean) => void>()

function reducedMotionQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  if (!reducedQuery) {
    reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => reducedListeners.forEach((l) => l(reducedQuery?.matches ?? false))
    // Safari < 14 lacks addEventListener on MediaQueryList.
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onChange)
    else if (reducedQuery.addListener) reducedQuery.addListener(onChange)
  }
  return reducedQuery
}

export function prefersReducedMotion(): boolean {
  return reducedMotionQuery()?.matches ?? false
}

/** Decorative motion runs only when BOTH the user pref and the OS allow it. */
export function motionAllowed(): boolean {
  return getMotionPrefs().animations && !prefersReducedMotion()
}

/** 3D depth effects additionally respect the depth toggle + coarse pointers. */
export function depthAllowed(): boolean {
  if (!getMotionPrefs().depth || !motionAllowed()) return false
  if (typeof window === 'undefined' || !window.matchMedia) return true
  // 3D tilt on touch screens fights with scroll gestures — desktop only.
  return window.matchMedia('(pointer: fine)').matches
}

export function subscribeReducedMotion(listener: (reduced: boolean) => void): () => void {
  reducedMotionQuery()
  reducedListeners.add(listener)
  return () => reducedListeners.delete(listener)
}

// ─── Haptics ────────────────────────────────────────────────────────────────
// Semantic patterns tuned on Android review devices. Durations in ms; gaps
// between entries are pauses. Cap at 2 pulses for "tap-class" events — long
// patterns feel buggy in the hand.

export const HAPTIC = {
  tap: [8],                    // nav item, chip, subtle press
  select: [10, 30, 6],         // selection committed
  toggle: [6, 24, 10],         // switch flipped
  success: [14, 46, 22],       // payment approved / saved
  warning: [22, 54, 22],       // retryable failure, gate notice
  error: [32, 60, 32],         // hard failure
  approve: [12, 40, 12, 40, 26], // two-step confirm (duties separation)
} as const

export type HapticEvent = keyof typeof HAPTIC

function vibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/**
 * Fire a named haptic pattern. Safe on every platform: no-ops when the device
 * has no vibration actuator, the user disabled haptics, the OS prefers
 * reduced motion (proxy for accessibility sensitivity) or the pattern fails.
 */
export function haptic(event: HapticEvent = 'tap') {
  if (!vibrationSupported()) return
  if (!getMotionPrefs().haptics) return
  if (prefersReducedMotion()) return
  try {
    navigator.vibrate(HAPTIC[event] as unknown as number[])
  } catch {
    // Chromium throws SecurityError in some embedded webviews — ignore.
  }
}

export function hapticsSupported(): boolean {
  return vibrationSupported()
}

// ─── CSS helpers shared with JS-driven effects ──────────────────────────────

/** Inline transition style from tokens (for style-driven components). */
export function transition(prop = 'transform, opacity', speed: keyof typeof MOTION.duration = 'fast', easing: keyof typeof MOTION.easing = 'standard') {
  return `${prop} ${MOTION.duration[speed]}ms ${MOTION.easing[easing]}`
}
