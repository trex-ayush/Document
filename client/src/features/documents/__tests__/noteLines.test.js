import { describe, it, expect } from 'vitest';
import { copyValue, parseNoteLines } from '../noteLines.js';

describe('parseNoteLines', () => {
  it('turns scanned "Label: value" lines into fields and keeps the rest as text', () => {
    const notes = 'Name: Ramesh Kumar\nDOB: 15/08/1985\nAadhaar No: 2345 6789 0124\n\nText read from the photo:\nGovernment of India';
    expect(parseNoteLines(notes)).toEqual([
      { type: 'field', label: 'Name', value: 'Ramesh Kumar' },
      { type: 'field', label: 'DOB', value: '15/08/1985' },
      { type: 'field', label: 'Aadhaar No', value: '2345 6789 0124' },
      { type: 'heading', value: 'Text read from the photo' },
      { type: 'text', value: 'Government of India' },
    ]);
  });

  it('works with Hindi labels and keeps colons inside the value', () => {
    expect(parseNoteLines('नाम: रमेश कुमार\nTime: 10:30')).toEqual([
      { type: 'field', label: 'नाम', value: 'रमेश कुमार' },
      { type: 'field', label: 'Time', value: '10:30' },
    ]);
  });

  it('leaves links, times and sentences with a colon late in them as plain text', () => {
    const notes = 'https://example.com/a\n10:30 appointment\nRemember to renew this card before the trip: in May';
    expect(parseNoteLines(notes).map((l) => l.type)).toEqual(['text', 'text', 'text']);
  });

  it('returns nothing for empty notes', () => {
    expect(parseNoteLines('')).toEqual([]);
    expect(parseNoteLines(null)).toEqual([]);
    expect(parseNoteLines('\n  \n')).toEqual([]);
  });
});

describe('copyValue', () => {
  it('copies grouped numbers without spaces', () => {
    expect(copyValue('2345 6789 0124')).toBe('234567890124');
    expect(copyValue('1234 5678 9012 3456')).toBe('1234567890123456');
  });

  it('copies everything else as shown', () => {
    expect(copyValue('Ramesh Kumar')).toBe('Ramesh Kumar');
    expect(copyValue('15/08/1985')).toBe('15/08/1985');
    expect(copyValue('House No 12, Lucknow')).toBe('House No 12, Lucknow');
    expect(copyValue('ABCDE1234F')).toBe('ABCDE1234F');
    expect(copyValue('   ')).toBe('   ');
  });
});
