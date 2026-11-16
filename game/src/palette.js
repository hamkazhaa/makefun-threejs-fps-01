// The single source of colour for Harbour Line. Everything on the dock
// draws from this table, so the dusk mood stays consistent: a cold blue
// sky, a low orange sun on the horizon, warm sodium lamps, wet concrete
// and rusted steel. The two teams are told apart by accent alone —
// Vanguard is teal, Ember is orange — and the HUD reuses the same inks.
export const PALETTE = {
  sky: 0x2b3550, // blue overhead at dusk
  horizon: 0xd98a4b, // the low sun where sky meets water
  canvas: 0x232a38, // fog and haze over the ground
  ground: 0x4b515a, // damp concrete underfoot
  groundDark: 0x3a4048, // darker concrete slabs
  steel: 0x5f6d7c, // container walls and gantry steel
  steelDark: 0x46525e, // dock walls and lamp poles
  rust: 0xa06b3e, // weathered container panels
  rustLight: 0xc07f45, // sun-bleached rust
  teal: 0x2fa8a0, // Vanguard accent
  tealDark: 0x1d6f6a, // deep Vanguard shade
  ember: 0xe05a2a, // Ember accent
  emberDark: 0x8f3413, // deep Ember shade
  lamp: 0xffb347, // sodium lamp glow
  ink: 0xf2ede3, // HUD lettering
  muted: 0x9aa3ad, // secondary HUD text
  accent: 0xffb347, // buy prompts and highlights
  danger: 0xe5484d, // damage and urgent states
  money: 0x7fd08a, // cash readouts
};
