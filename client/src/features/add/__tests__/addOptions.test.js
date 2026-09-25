import { describe, expect, it } from 'vitest';
import { ADD_OPTIONS, addPath } from '../addOptions.js';

describe('add options', () => {
  it('lists the four options in order', () => {
    expect(ADD_OPTIONS.map((o) => o.key)).toEqual(['document', 'photo', 'password', 'note']);
  });

  it('builds the add routes, carrying the folder and the camera flag', () => {
    expect(addPath('document')).toBe('/add/document');
    expect(addPath('photo')).toBe('/add/document?capture=1');
    expect(addPath('photo', 'f1')).toBe('/add/document?folderId=f1&capture=1');
    expect(addPath('password', 'f1')).toBe('/add/password?folderId=f1');
    expect(addPath('note')).toBe('/add/note');
    expect(() => addPath('record')).toThrow();
  });
});
