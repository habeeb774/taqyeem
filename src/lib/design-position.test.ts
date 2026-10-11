import { describe, expect, it } from 'vitest';
import { moveDesignBox, resizeDesignBox } from './design-position';

const box = { x: 400, y: 200, width: 300, height: 100, rotation: 0 };
const bounds = { width: 1200, height: 800 };

describe('design editor positions', () => {
  it.each([0.2, 0.6, 1, 2])('follows pointer direction and distance at zoom %s', (zoom) => {
    const result = moveDesignBox(box, 60 / zoom, 30 / zoom, bounds);
    expect(result.x).toBe(Math.round(400 - 60 / zoom));
    expect(result.y).toBe(Math.round(200 + 30 / zoom));
  });

  it('keeps movement inside the design and recovers old negative positions', () => {
    expect(moveDesignBox(box, 2000, -2000, bounds)).toMatchObject({ x: 0, y: 0 });
    expect(moveDesignBox(box, -2000, 2000, bounds)).toMatchObject({ x: 900, y: 700 });
    expect(moveDesignBox({ ...box, x: -360 }, 0, 0, bounds).x).toBe(0);
  });

  it('grows from the bottom-left corner without moving the opposite corner', () => {
    expect(resizeDesignBox(box, -60, 30)).toEqual({ ...box, width: 360, height: 130 });
    expect(resizeDesignBox(box, 1000, -1000)).toMatchObject({ width: 20, height: 20 });
  });

  it('resizes along rotated local axes while keeping the top-right corner fixed', () => {
    const rotated = { ...box, rotation: 90 };
    const result = resizeDesignBox(rotated, -30, -60);
    expect(result).toMatchObject({ width: 360, height: 130, x: 385, y: 155 });
  });
});
