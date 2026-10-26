/**
 * Motion vocabulary. Three springs cover everything: SNAP for things you
 * click, SOFT for panels and sheets, BRICK for the playful moments (a brick
 * landing, a stud popping). Motion marks a change; nothing loops for its own
 * sake except the ambient light.
 */
import type { Transition, Variants } from 'framer-motion'

export const SNAP: Transition = { type: 'spring', stiffness: 520, damping: 36, mass: 0.8 }
export const SOFT: Transition = { type: 'spring', stiffness: 260, damping: 32 }
export const BRICK: Transition = { type: 'spring', stiffness: 620, damping: 19, mass: 0.9 }
export const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** Page entrance: a short rise, children staggered like bricks being stacked. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE_OUT, staggerChildren: 0.045, delayChildren: 0.04 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.14, ease: 'easeIn' } },
}

export const riseItem: Variants = {
  initial: { opacity: 0, y: 14 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT } },
}

export const dealCard: Variants = {
  initial: { opacity: 0, y: 26, rotate: -4, scale: 0.94 },
  enter: (i: number = 0) => ({ opacity: 1, y: 0, rotate: 0, scale: 1, transition: { ...BRICK, delay: i * 0.07 } }),
}
