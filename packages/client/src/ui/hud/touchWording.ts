const REPLACEMENTS: [string, string][] = [
  ['Hold E to ', 'Hold Act to '],
  ['Hold F to ', 'Hold Use to '],
  ['Hold X to ', 'Hold Reset to '],
  ['E to ', 'Act to '],
  ['F to ', 'Use to '],
];

export function touchWording(hint: string): string {
  for (const [from, to] of REPLACEMENTS) if (hint.startsWith(from)) return to + hint.slice(from.length);
  return hint;
}
