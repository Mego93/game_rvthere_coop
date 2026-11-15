const DEFAULT_ADDRESS = '127.0.0.1';

const isIpv4 = (text: string): boolean => {
  const parts = text.split('.');
  return parts.length === 4 && parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
};

const isIpv6 = (text: string): boolean => {
  if (!/^[0-9a-f:.]+$/i.test(text)) return false;
  const halves = text.split('::');
  if (halves.length > 2) return false;
  let groups = 0;
  const count = (half: string, last: boolean): boolean => {
    if (half === '') return true;
    const parts = half.split(':');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (last && i === parts.length - 1 && part.includes('.')) {
        if (!isIpv4(part)) return false;
        groups += 2;
      } else if (/^[0-9a-f]{1,4}$/i.test(part)) groups += 1;
      else return false;
    }
    return true;
  };
  if (halves.length === 1) return count(text, true) && groups === 8;
  return count(halves[0]!, false) && count(halves[1]!, true) && groups <= 7;
};

export const isValidIp = (text: string): boolean => isIpv4(text) || isIpv6(text);

// The client's address: CF-Connecting-IP when it is an IP address, else a loopback placeholder.
export function clientAddress(header: string | null): string {
  const value = header?.trim() ?? '';
  return isValidIp(value) ? value : DEFAULT_ADDRESS;
}
