// Luiz's complaints; the server sends the index. Light, and never about the people.
export const COMPLAINTS: readonly string[] = [
  'It is 38 degrees and the sun has no off switch.',
  'Why is there a fly on my tea AND on my toast?',
  'The traffic here has opinions about lanes. None match mine.',
  'I asked the price and got a story. Then the price.',
  'Is it me, or is the sun following us?',
  'My phone says 41 degrees and my face agrees.',
  'That fly has been in my personal space for ten minutes.',
  'Nobody told me the scooters get a vote on every road.',
  'The forecast is just the word "hot" in different fonts.',
  'Haggling is a sport, and I did not train.',
  'I love this country. I would love it more with air conditioning.',
  'Seven dirhams? Last time it was five. Inflation is personal.',
];

// Out-of-range indices wrap, so a newer server never shows nothing.
export const complaintText = (line: number): string => COMPLAINTS[((Math.trunc(line) % COMPLAINTS.length) + COMPLAINTS.length) % COMPLAINTS.length]!;
