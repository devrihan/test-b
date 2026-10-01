import type { StageId } from "../model/dams";

// Constrained pixel-art palette — SUNNY DAY light theme. Two color systems, kept
// deliberately separate so they don't fight each other on the wall:
//   • CARGO  = a monotonic cool→green PROGRESS ramp (reads as "how far along").
//   • DAMS   = human vs automated (warm = beaver/human gate, cool = compute).
// Mixing the human signal into the cargo ramp would break the progress reading,
// so the "who works here" signal lives on the dam, the "how far" signal on cargo.
//
// Light-theme rule: text is DARK so it stays legible on the bright sky / light
// river. Anywhere a glyph used to be drawn in COLORS.bg (text-on-dark) is now
// drawn in COLORS.text (text-on-light) — see scene.ts dam initials & roll numbers.

export const COLORS = {
  bg: 0xdcefff, // soft warm sky blue
  river: 0x8fc7f5, // light blue river band
  riverEdge: 0x6fb0e8, // slightly deeper blue band edge
  laneEven: 0x9fcef7, // barely-there light blue lane tints over the river
  laneOdd: 0x86c0f2,
  groupLabel: 0x1f5e8c, // saturated blue group/bay labels
  caption: 0x274a5e, // on-raft batch name
  shore: 0xe7dcc2, // sandy light shore
  damAuto: 0x2f74b5, // automated gate (cool blue) — contrast on light
  damHuman: 0xd98a1f, // beaver gate (warm amber) — backlog here = ops action
  damPost: 0xb9d6f0,
  raftHull: 0x9a6e3f, // wood — reads well on light water
  raftHullEdge: 0x5b4126, // darker wood edge
  raftHi: 0xb98a52, // hull top highlight plank
  cargoEmpty: 0xc9b89a, // recessed bay — a not-yet-uploaded paper slot (light wood)
  text: 0x16313f, // dark, readable on light
  textDim: 0x4c6b80,
  failed: 0xd62828, // strong red
  flag: 0xd62828,
  flagPole: 0x5b4126,
  waterfall: 0x4aa3e8, // brighter blue spill over the light river
  tail: 0xc77d11, // straggler tail line (deep amber, visible on light blue)
  zonePanel: 0xcfe6fb, // Config / Downstream stub backdrops (light)
  zoneStripe: 0xb6d6f2,
  zoneText: 0x35617f,
  focusRing: 0xf08c00, // strong saturated gold/orange keyboard focus
  // ── bay (loading dock) fills — sandy/tinted, nested depth ───────────────
  baySchool: 0xe7dcc2, // outermost — sandy
  bayGrade: 0xefe6d2, // mid — lighter sand
  baySubject: 0xf7f0e0, // innermost — lightest sand (rafts sit here)
  bayBorder: 0xc7b48f, // bay box outline
  bayLabel: 0x6b4f2a, // dark wood-brown bay labels
} as const;

// Monotonic progress ramp across the 8 stages (lightness/saturation chosen so a
// glance reads progress without a legend AND each step is clearly visible on the
// light-blue river — nothing near-white). LOCKED-adjacent: progress legibility.
const STAGE_RAMP: Record<StageId, number> = {
  queued: 0x4a6076, // slate
  upload_scan: 0x2f6fae, // deep blue
  answer_chunking: 0x1f93a8, // teal
  bbox_review: 0x179c7a, // green-teal
  answer_extraction: 0x2f9e4f, // green
  answer_editing: 0x4faa2c, // grass green
  insight_generation: 0x7aae18, // olive green
  done: 0x9c8f0a, // golden-olive (deep enough to read on light blue)
};

/** Cargo cell color = how far this bundle has progressed (the progress ramp). */
export function stageColor(stage: StageId): number {
  return STAGE_RAMP[stage];
}

// Per-stage IDENTITY tint — the full-height sequence lines + each dam box's stripe.
// SINGLE HUE (teal, ~174°), graded light→dark by pipeline PROGRESS so the stages
// stay individually distinct but the wall reads as one calm colour family against
// the light-blue river (Fahad 2026-06-21: "gradations of one colour … tints of the
// same colour so the overall visuals look good"). Early stages are paler, late
// stages deeper — the gradient itself encodes how far along the river you are.
export const STAGE_TINT: Record<StageId, number> = {
  queued: 0x8fd6cd, // palest — intake shore
  upload_scan: 0x66c7bc,
  answer_chunking: 0x3db8ab,
  bbox_review: 0x2a9d91,
  answer_extraction: 0x228478,
  answer_editing: 0x1b6c62,
  insight_generation: 0x15564e,
  done: 0x0f423b, // deepest — over the waterfall
};
