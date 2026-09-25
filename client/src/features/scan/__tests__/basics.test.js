import { describe, it, expect } from 'vitest';
import { verhoeffValidate, verhoeffCheckDigit, isValidAadhaarNumber } from '../verhoeff.js';
import { normalizeDate, findDates, mrzDateToIso, toIsoDate } from '../dates.js';
import { fixDigits, fixByShape, toTitleCase, looksLikeName, cleanName } from '../textUtils.js';
import { findPans, findEpics, findIfscs, findDlNumbers, findAadhaarNumbers } from '../patterns.js';

// All numbers below are made up. The Aadhaar ones are generated to pass Verhoeff.
const FAKE_AADHAAR = '234567890124';
const FAKE_AADHAAR_2 = '987654321096';

describe('verhoeff', () => {
  it('validates the textbook example and fake Aadhaar numbers', () => {
    expect(verhoeffValidate('2363')).toBe(true);
    expect(verhoeffValidate('2364')).toBe(false);
    expect(verhoeffCheckDigit('236')).toBe('3');
    expect(isValidAadhaarNumber(FAKE_AADHAAR)).toBe(true);
    expect(isValidAadhaarNumber('2345 6789 0124')).toBe(true);
    expect(isValidAadhaarNumber(FAKE_AADHAAR_2)).toBe(true);
  });

  it('rejects single-digit errors, adjacent swaps and numbers starting 0/1', () => {
    expect(isValidAadhaarNumber('234567890125')).toBe(false);
    expect(isValidAadhaarNumber('324567890124')).toBe(false);
    expect(isValidAadhaarNumber('134567890124'.slice(0, 11) + verhoeffCheckDigit('13456789012'))).toBe(false);
    expect(isValidAadhaarNumber('12345')).toBe(false);
    expect(isValidAadhaarNumber('')).toBe(false);
  });
});

describe('dates', () => {
  it('normalises day-first Indian formats to YYYY-MM-DD', () => {
    expect(normalizeDate('DOB: 15/08/1985')).toBe('1985-08-15');
    expect(normalizeDate('15-08-1985')).toBe('1985-08-15');
    expect(normalizeDate('15.08.1985')).toBe('1985-08-15');
    expect(normalizeDate('5/8/1985')).toBe('1985-08-05');
    expect(normalizeDate('15 AUG 1985')).toBe('1985-08-15');
    expect(normalizeDate('15-Aug-1985')).toBe('1985-08-15');
    expect(normalizeDate('Valid till 14 September 2040')).toBe('2040-09-14');
    expect(normalizeDate('2030-01-31')).toBe('2030-01-31');
  });

  it('fixes OCR look-alikes only inside date-shaped runs', () => {
    expect(normalizeDate('DOB : l5/O8/l985')).toBe('1985-08-15');
    expect(normalizeDate('DOB: 1S/08/19B5')).toBe('1985-08-15');
  });

  it('rejects impossible dates', () => {
    expect(normalizeDate('31/02/1990')).toBe(null);
    expect(normalizeDate('12/13/1990')).toBe(null);
    expect(toIsoDate(1850, 1, 1)).toBe(null);
    expect(normalizeDate('no date here')).toBe(null);
  });

  it('finds several dates in order', () => {
    const d = findDates('Date of Issue 01/02/2020   Date of Expiry 31/01/2030');
    expect(d.map((x) => x.iso)).toEqual(['2020-02-01', '2030-01-31']);
  });

  it('maps MRZ YYMMDD with the right century', () => {
    const today = new Date('2026-09-25T00:00:00Z');
    expect(mrzDateToIso('900215', 'birth', today)).toBe('1990-02-15');
    expect(mrzDateToIso('150101', 'birth', today)).toBe('2015-01-01');
    expect(mrzDateToIso('330714', 'expiry', today)).toBe('2033-07-14');
    expect(mrzDateToIso('99AB01', 'birth', today)).toBe(null);
  });
});

describe('text utils', () => {
  it('fixes digit look-alikes', () => {
    expect(fixDigits('2O45 l23S B9')).toBe('2045 1235 89');
  });

  it('fixes by positional shape', () => {
    expect(fixByShape('A8CDE1Z34F', 'AAAAA9999A')).toBe('ABCDE1234F');
    expect(fixByShape('ABCDEI234F', 'AAAAA9999A')).toBe('ABCDE1234F');
    expect(fixByShape('SHORT', 'AAAAA9999A')).toBe(null);
  });

  it('title-cases shouted names but leaves mixed case alone', () => {
    expect(toTitleCase('RAMESH KUMAR')).toBe('Ramesh Kumar');
    expect(toTitleCase('anita devi')).toBe('Anita Devi');
    expect(toTitleCase('Anil McDonald')).toBe('Anil McDonald');
  });

  it('recognises name-like lines', () => {
    expect(looksLikeName('Ramesh Kumar')).toBe(true);
    expect(looksLikeName('रमेश कुमार Ramesh Kumar')).toBe(true);
    expect(looksLikeName('GOVERNMENT OF INDIA')).toBe(false);
    expect(looksLikeName('DOB: 15/08/1985')).toBe(false);
    expect(looksLikeName('Mr')).toBe(false);
    expect(cleanName('Name: RAMESH KUMAR.')).toBe('Ramesh Kumar');
  });
});

describe('identifier patterns', () => {
  it('finds a PAN, repairing OCR slips by position', () => {
    expect(findPans('Permanent Account Number\nABCPE1234F')[0]).toEqual({ value: 'ABCPE1234F', confidence: 'high' });
    expect(findPans('ABCPE l234F')[0].value).toBe('ABCPE1234F');
    expect(findPans('A8CPE1234F')[0]).toEqual({ value: 'ABCPE1234F', confidence: 'low' });
    expect(findPans('INCOME TAX DEPARTMENT')).toEqual([]);
  });

  it('finds an EPIC number', () => {
    expect(findEpics('EPIC No. XYZ1234567')[0]).toEqual({ value: 'XYZ1234567', confidence: 'high' });
    expect(findEpics('XYZ12345G7')[0]).toEqual({ value: 'XYZ1234567', confidence: 'low' });
    expect(findEpics('ELECTION COMMISSION')).toEqual([]);
  });

  it('finds an IFSC code (5th character zero, even if read as O)', () => {
    expect(findIfscs('IFSC: SBIN0001234')[0]).toEqual({ value: 'SBIN0001234', confidence: 'high' });
    expect(findIfscs('IFS Code HDFCO000123')[0]).toEqual({ value: 'HDFC0000123', confidence: 'low' });
    expect(findIfscs('SBIN1001234')).toEqual([]);
  });

  it('finds driving-licence numbers in common state formats', () => {
    expect(findDlNumbers('DL No: MH12 20110012345')[0]).toEqual({ value: 'MH12 20110012345', confidence: 'high' });
    expect(findDlNumbers('DL-0420110149646')[0].value).toBe('DL04 20110149646');
    expect(findDlNumbers('KA-01-2020-0001234')[0].value).toBe('KA01 20200001234');
    expect(findDlNumbers('UP14 2O19OO12345')[0]).toEqual({ value: 'UP14 20190012345', confidence: 'low' });
    expect(findDlNumbers('Phone 9876543210')).toEqual([]);
  });

  it('finds only checksum-valid Aadhaar numbers, never a VID', () => {
    expect(findAadhaarNumbers('2345 6789 0124')).toEqual([{ value: '2345 6789 0124', confidence: 'high' }]);
    expect(findAadhaarNumbers('2345 6789 O124')).toEqual([{ value: '2345 6789 0124', confidence: 'low' }]);
    expect(findAadhaarNumbers('2345 6789 0125')).toEqual([]);
    expect(findAadhaarNumbers('VID : 9123 2345 6789 0124')).toEqual([]);
    expect(findAadhaarNumbers('VID : 2345 6789 0124 9123')).toEqual([]);
  });
});
