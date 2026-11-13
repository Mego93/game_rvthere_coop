// A press that follows the touch that started it; other touches landing on the same element are ignored.
export interface OwnedPress {
  // True when the press went down.
  start(id: number): boolean;
  // True when the owning touch is among the ended ones and the press went up.
  end(ids: Iterable<number>): boolean;
  // True when a held press went up.
  cancel(): boolean;
  held(): boolean;
}

export function createOwnedPress(): OwnedPress {
  let owner: number | null = null;
  return {
    start(id) {
      if (owner !== null) return false;
      owner = id;
      return true;
    },
    end(ids) {
      if (owner === null) return false;
      for (const id of ids) {
        if (id === owner) {
          owner = null;
          return true;
        }
      }
      return false;
    },
    cancel() {
      if (owner === null) return false;
      owner = null;
      return true;
    },
    held: () => owner !== null,
  };
}
