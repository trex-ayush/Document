import { describe, expect, it } from 'vitest';
import { clampPage, pageCount, pageNumbers, pageRange, pageSlice } from '../pagination.js';

describe('pageCount', () => {
  it('rounds up and never goes below 1', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(120, 25)).toBe(5);
  });
});

describe('clampPage', () => {
  it('keeps the page inside the list', () => {
    expect(clampPage(0, 100, 25)).toBe(1);
    expect(clampPage(9, 100, 25)).toBe(4);
    expect(clampPage(3, 10, 25)).toBe(1);
  });
});

describe('pageNumbers', () => {
  it('lists every page when there are 5 or fewer', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('shows the first pages near the start', () => {
    expect(pageNumbers(1, 12)).toEqual([1, 2, 3, 4, '…', 12]);
    expect(pageNumbers(3, 12)).toEqual([1, 2, 3, 4, '…', 12]);
  });

  it('shows the current page with its neighbours in the middle', () => {
    expect(pageNumbers(5, 12)).toEqual([1, '…', 4, 5, 6, '…', 12]);
  });

  it('shows the last pages near the end', () => {
    expect(pageNumbers(12, 12)).toEqual([1, '…', 9, 10, 11, 12]);
    expect(pageNumbers(10, 12)).toEqual([1, '…', 9, 10, 11, 12]);
  });

  it('handles 6 pages without a pointless gap', () => {
    expect(pageNumbers(1, 6)).toEqual([1, 2, 3, 4, '…', 6]);
    expect(pageNumbers(4, 6)).toEqual([1, '…', 3, 4, 5, 6]);
  });
});

describe('pageRange and pageSlice', () => {
  it('gives the rows shown on a page', () => {
    expect(pageRange(1, 25, 120)).toEqual({ from: 1, to: 25 });
    expect(pageRange(5, 25, 120)).toEqual({ from: 101, to: 120 });
    expect(pageRange(1, 25, 0)).toEqual({ from: 0, to: 0 });
  });

  it('slices the list for a page', () => {
    const items = Array.from({ length: 7 }, (_, i) => i + 1);
    expect(pageSlice(items, 1, 3)).toEqual([1, 2, 3]);
    expect(pageSlice(items, 3, 3)).toEqual([7]);
    expect(pageSlice(items, 9, 3)).toEqual([7]);
  });
});
