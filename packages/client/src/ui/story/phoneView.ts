import { PHONE_SHOP_PRICES, STORY_PRICES, type CharacterId, type PhoneShopItem, type StoryFriendView, type StoryPriced } from '@lodgy/shared';
import { fakeRepublicShown } from './needsView';

export const ATM_AMOUNTS = [100, 500] as const;

export const SHOP_LABELS: Record<PhoneShopItem, string> = { tcgPack: 'TCG card pack', shirt: 'Shirt', suit: 'Suit' };
export const KIOSK_LABELS: Record<StoryPriced, string> = { fromageBlanc: 'Fromage blanc', kokeZero: 'Koke Zero', treedent: 'Treedent gum', nutellaCrepe: 'Nutella crepe', tajine: 'Tajine', water: 'Water', tea: 'Mint tea', coffee: 'Coffee' };
export const ITEM_NAMES: Record<string, string> = { ...KIOSK_LABELS, pizza: 'Pizza', jerrycan: 'Jerrycan', toolbox: 'Toolbox', healthKit: 'Health kit', ammo: 'Ammo', gun: 'Gun' };

export interface PhoneView {
  cash: number;
  bank: number;
  atm: { reachable: boolean; buttons: { amount: number; enabled: boolean }[] };
  // Alexander's phone shop; null for everyone else.
  shop: { item: PhoneShopItem; label: string; price: number; enabled: boolean }[] | null;
  fakeRepublic: boolean;
}

// What the phone offers this friend now. The ATM works only near it; the shop is Alexander's; Fake Republic only when poor.
export function phoneView(friend: StoryFriendView, character: CharacterId | null, nearAtm: boolean): PhoneView {
  return {
    cash: friend.cash,
    bank: friend.bank,
    atm: { reachable: nearAtm, buttons: ATM_AMOUNTS.map((amount) => ({ amount, enabled: nearAtm && friend.bank >= amount })) },
    shop: character === 'alexander' ? (Object.keys(PHONE_SHOP_PRICES) as PhoneShopItem[]).map((item) => ({ item, label: SHOP_LABELS[item], price: PHONE_SHOP_PRICES[item], enabled: friend.bank >= PHONE_SHOP_PRICES[item] })) : null,
    fakeRepublic: fakeRepublicShown(friend),
  };
}

export interface KioskView {
  cash: number;
  buy: { item: StoryPriced; label: string; price: number; enabled: boolean }[];
  // What the friend carries, to eat now.
  eat: { item: string; label: string; count: number }[];
}

export function kioskView(friend: StoryFriendView): KioskView {
  const counts = new Map<string, number>();
  for (const item of friend.items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return {
    cash: friend.cash,
    buy: (Object.keys(STORY_PRICES) as StoryPriced[]).map((item) => ({ item, label: KIOSK_LABELS[item], price: STORY_PRICES[item], enabled: friend.cash >= STORY_PRICES[item] })),
    eat: [...counts].map(([item, count]) => ({ item, label: ITEM_NAMES[item] ?? item, count })),
  };
}
