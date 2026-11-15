export interface PromptPart { key: string | null; hold: boolean; text: string }

const PATTERN = /^(Hold )?(E|F|X|Act|Use|Reset) to /;

export function splitPrompt(prompt: string): PromptPart[] {
  const parts = prompt.split(/ {3,}/).map((p) => p.replace(/ {2,}/g, ' ')).filter((p) => p !== '');
  if (parts.length === 0) return [{ key: null, hold: false, text: '' }];
  return parts.map((part) => {
    const m = PATTERN.exec(part);
    if (!m) return { key: null, hold: false, text: part };
    return { key: m[2] as string, hold: m[1] !== undefined, text: part.slice(m[0].length) };
  });
}
