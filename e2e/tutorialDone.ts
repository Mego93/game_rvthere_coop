// Storage with the tutorial finished (flag lodgy.tutorial.done), so its card never covers the lobby; its own spec opts out.
export const tutorialDone = (origin: string) => ({
  cookies: [],
  origins: [{ origin, localStorage: [{ name: 'lodgy.tutorial.done', value: '1' }] }],
});
