// Breaks a line into rows of at most `width` characters at spaces; a word longer than a row stays whole.
export function wrapText(text: string, width: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of text.trim().split(/\s+/)) {
    if (word === '') continue;
    if (row !== '' && row.length + 1 + word.length > width) {
      rows.push(row);
      row = word;
    } else row = row === '' ? word : `${row} ${word}`;
  }
  if (row !== '') rows.push(row);
  return rows;
}

export const BUBBLE_SECONDS = 4;

// Whether a bubble shown at `since` is still up at `now`.
export const bubbleUp = (since: number, now: number): boolean => now - since < BUBBLE_SECONDS;
