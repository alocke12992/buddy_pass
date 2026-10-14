import { describe, expect, it } from 'vitest';
import { FRIEND_ACCENTS, friendAccent } from './colors';

describe('friendAccent', () => {
  it('assigns the palette in its documented order', () => {
    expect([0, 1, 2, 3, 4, 5].map(friendAccent)).toEqual([
      '#A78BFA',
      '#4EA8F4',
      '#F472B6',
      '#2DD4BF',
      '#FB923C',
      '#E879F9',
    ]);
  });

  it('cycles once the palette runs out', () => {
    expect(friendAccent(6)).toBe(friendAccent(0));
    expect(friendAccent(13)).toBe(friendAccent(1));
  });

  it('still lands on a palette colour for negative indices', () => {
    expect(friendAccent(-1)).toBe('#E879F9');
    expect(friendAccent(-7)).toBe('#E879F9');
  });

  it('never hands out volt — that colour always means you', () => {
    expect(FRIEND_ACCENTS).not.toContain('#C8F542');
  });
});
