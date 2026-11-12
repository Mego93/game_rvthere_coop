// Room names. Lower-case letters only, so that none can match a static file path or a reserved path.
export const NOUNS: readonly string[] = [
  'tagine', 'camel', 'souk', 'riad', 'argan', 'atlas', 'medina', 'oasis', 'dune', 'palm',
  'mint', 'saffron', 'kasbah', 'minaret', 'lantern', 'caravan', 'olive', 'fig', 'cedar', 'almond',
  'cumin', 'harira', 'couscous', 'babouche', 'zellige', 'fountain', 'courtyard', 'terrace', 'donkey', 'stork',
  'gecko', 'falcon', 'jackal', 'gazelle', 'tortoise', 'hedgehog', 'cactus', 'jasmine', 'orange', 'lemon',
  'apricot', 'pepper', 'ginger', 'cinnamon', 'clove', 'honey', 'teapot', 'kettle', 'carpet', 'drum',
  'flute', 'kite', 'compass', 'pebble', 'canyon', 'gorge', 'summit', 'valley', 'river', 'bridge',
];

// Paths the server uses for something else; no room may take one.
export const RESERVED_PATHS: readonly string[] = ['ws', 'assets', 'index', 'favicon'];

// Picks a noun no live room uses. When every noun is taken, a number is appended.
export function pickNoun(random: () => number, isTaken: (noun: string) => boolean): string {
  const start = Math.floor(random() * NOUNS.length) % NOUNS.length;
  for (let suffix = 1; ; suffix++) {
    for (let i = 0; i < NOUNS.length; i++) {
      const word = NOUNS[(start + i) % NOUNS.length]!;
      const noun = suffix === 1 ? word : `${word}${suffix}`;
      if (!isTaken(noun)) return noun;
    }
  }
}
