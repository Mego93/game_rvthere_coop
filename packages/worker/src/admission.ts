import { MAX_MESSAGE_BYTES } from '@lodgy/shared';

export type AdmissionResult = 'ok' | 'full' | 'busy';

export interface AdmissionLimits {
  perRoom: number;
  perAddress: number;
}

export interface Admission {
  // Counts the connection when the result is ok.
  admit(address: string): AdmissionResult;
  release(address: string): void;
  count(): number;
}

export function createAdmission(limits: AdmissionLimits): Admission {
  let total = 0;
  const perAddress = new Map<string, number>();
  return {
    admit(address) {
      if (total >= limits.perRoom) return 'full';
      const used = perAddress.get(address) ?? 0;
      if (used >= limits.perAddress) return 'busy';
      total += 1;
      perAddress.set(address, used + 1);
      return 'ok';
    },
    release(address) {
      const used = perAddress.get(address) ?? 0;
      if (used === 0) return;
      total -= 1;
      if (used > 1) perAddress.set(address, used - 1);
      else perAddress.delete(address);
    },
    count: () => total,
  };
}

const encoder = new TextEncoder();
export const utf8Bytes = (text: string): number => encoder.encode(text).length;
export const exceedsMessageLimit = (text: string): boolean => utf8Bytes(text) > MAX_MESSAGE_BYTES;
