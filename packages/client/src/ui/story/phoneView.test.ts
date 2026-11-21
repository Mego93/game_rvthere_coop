import { describe, expect, it } from 'vitest';
import type { StoryFriendView } from '@lodgy/shared';
import { kioskView, phoneView } from './phoneView';

const friend = (over: Partial<StoryFriendView> = {}): StoryFriendView => ({ health: 100, food: 80, happiness: 70, tiredness: 10, cash: 50, bank: 2000, items: [], caffeine: { fast: 0, slow: 0 }, ...over });

describe('phoneView', () => {
  it('shows the money', () => {
    const view = phoneView(friend({ cash: 40, bank: 1500 }), 'huu', false);
    expect([view.cash, view.bank]).toEqual([40, 1500]);
  });

  it('lets the ATM withdraw only near the ATM and only up to the bank', () => {
    expect(phoneView(friend(), 'huu', false).atm.buttons.every((button) => !button.enabled)).toBe(true);
    expect(phoneView(friend(), 'huu', true).atm.buttons.map((button) => [button.amount, button.enabled])).toEqual([[100, true], [500, true]]);
    expect(phoneView(friend({ bank: 300 }), 'huu', true).atm.buttons.map((button) => button.enabled)).toEqual([true, false]);
  });

  it("shows Alexander's shop with its three items to him alone, enabled by what the bank holds", () => {
    expect(phoneView(friend(), 'huu', false).shop).toBeNull();
    const shop = phoneView(friend({ bank: 700 }), 'alexander', false).shop!;
    expect(shop.map((entry) => [entry.item, entry.price, entry.enabled])).toEqual([['tcgPack', 150, true], ['shirt', 600, true], ['suit', 1500, false]]);
  });

  it('shows Fake Republic only under 200 dirhams in all, and not once played', () => {
    expect(phoneView(friend({ cash: 100, bank: 99 }), 'huu', false).fakeRepublic).toBe(true);
    expect(phoneView(friend({ cash: 100, bank: 100 }), 'huu', false).fakeRepublic).toBe(false);
    expect(phoneView(friend({ cash: 0, bank: 0, played: true }), 'huu', false).fakeRepublic).toBe(false);
  });
});

describe('kioskView', () => {
  it('lists every price, enabled by the cash, and what is carried', () => {
    const view = kioskView(friend({ cash: 12, items: ['tea', 'tea', 'treedent'] }));
    expect(view.buy.find((entry) => entry.item === 'tea')).toMatchObject({ price: 10, enabled: true });
    expect(view.buy.find((entry) => entry.item === 'tajine')).toMatchObject({ price: 80, enabled: false });
    expect(view.buy).toHaveLength(8);
    expect(view.eat).toEqual([{ item: 'tea', label: 'Mint tea', count: 2 }, { item: 'treedent', label: 'Treedent gum', count: 1 }]);
  });
});
