const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** "15m" -> 900000 (milliseconds). Throws on anything else; env.js validates the format at boot. */
export function toMs(value) {
  const match = /^(\d+)([smhdw])$/.exec(String(value));
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNITS[match[2]];
}

export const toSeconds = (value) => Math.floor(toMs(value) / 1000);
