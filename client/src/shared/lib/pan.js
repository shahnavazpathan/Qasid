export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// "ABCDE1234F Mom, PQRSX9876Z" -> [{ pan, nickname }]
export function parsePans(text) {
  return String(text || "")
    .split(/\r?\n|,|;/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(chunk => {
      const [pan, ...rest] = chunk.split(/\s+/);
      return { pan: pan.toUpperCase(), nickname: rest.join(" ") };
    });
}
