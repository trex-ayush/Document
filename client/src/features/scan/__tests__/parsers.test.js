import { describe, it, expect } from 'vitest';
import { parseAadhaar } from '../parsers/aadhaar.js';
import { parsePan } from '../parsers/pan.js';
import { parsePassport, extractMrzLines } from '../parsers/passport.js';
import { parseDrivingLicence } from '../parsers/drivingLicence.js';
import { parseVoterId } from '../parsers/voterId.js';
import { parseBank } from '../parsers/bank.js';
import { detectDocKind, kindFromTypeName, findTypeForKind } from '../detectType.js';

// Every name, number and address here is invented. Samples imitate real
// Tesseract output: stray symbols, Hindi next to English, look-alike slips.
const TODAY = new Date('2026-09-25T00:00:00Z');

/** Lines with a per-line OCR confidence. */
const L = (text, confidence = 90) => text.split('\n').map((t) => ({ text: t, confidence }));

const AADHAAR_FRONT = `भारत सरकार
GOVERNMENT OF INDIA
| रमेश कुमार
Ramesh Kumar
जन्म तिथि/DOB: 15/08/1985
पुरुष / MALE
2345 6789 0124
आधार - आम आदमी का अधिकार`;

const AADHAAR_BACK = `भारतीय विशिष्ट पहचान प्राधिकरण
Unique Identification Authority of India
पता: S/O सुरेश कुमार, मकान 12, एमजी रोड
Address: S/O Suresh Kumar, House No 12,
MG Road, Near Shiv Mandir,
Gomti Nagar, Lucknow,
Uttar Pradesh - 226010
2345 6789 0124
1947 help@uidai.gov.in www.uidai.gov.in`;

describe('parseAadhaar', () => {
  it('reads the front side', () => {
    const r = parseAadhaar(L(AADHAAR_FRONT));
    expect(r.fields.number).toEqual({ value: '2345 6789 0124', confidence: 'high' });
    expect(r.fields.name).toEqual({ value: 'Ramesh Kumar', confidence: 'high' });
    expect(r.fields.dob).toEqual({ value: '1985-08-15', confidence: 'high' });
    expect(r.fields.gender.value).toBe('Male');
    expect(r.fields.address).toBeUndefined();
  });

  it('reads the address from the back side, dropping the care-of part', () => {
    const r = parseAadhaar(L(AADHAAR_BACK));
    expect(r.fields.address.value).toBe('House No 12, MG Road, Near Shiv Mandir, Gomti Nagar, Lucknow, Uttar Pradesh - 226010');
    expect(r.fields.number.value).toBe('2345 6789 0124');
  });

  it('handles year of birth and marks shaky lines low-confidence', () => {
    const r = parseAadhaar([
      { text: 'Government of India', confidence: 92 },
      { text: 'Anita Devi', confidence: 61 },
      { text: 'Year of Birth : l990', confidence: 88 },
      { text: 'FEMALE', confidence: 90 },
      { text: '9876 5432 1096', confidence: 85 },
    ]);
    expect(r.fields.yob.value).toBe('1990');
    expect(r.fields.name).toEqual({ value: 'Anita Devi', confidence: 'low' });
    expect(r.fields.gender.value).toBe('Female');
    expect(r.fields.number.value).toBe('9876 5432 1096');
  });

  it('refuses a number that fails the Verhoeff checksum', () => {
    const r = parseAadhaar(L('Ramesh Kumar\nDOB: 15/08/1985\n2345 6789 0128'));
    expect(r.fields.number).toBeUndefined();
  });
});

describe('parsePan', () => {
  it('reads the new labelled layout', () => {
    const r = parsePan(L(`आयकर विभाग भारत सरकार
INCOME TAX DEPARTMENT GOVT. OF INDIA
स्थायी लेखा संख्या कार्ड
Permanent Account Number Card
ABCPK1234F
नाम / Name
RAMESH KUMAR
पिता का नाम / Father's Name
SURESH KUMAR
जन्म की तारीख / Date of Birth
15/08/1985`));
    expect(r.fields.number).toEqual({ value: 'ABCPK1234F', confidence: 'high' });
    expect(r.fields.name.value).toBe('Ramesh Kumar');
    expect(r.fields.fatherName.value).toBe('Suresh Kumar');
    expect(r.fields.dob.value).toBe('1985-08-15');
  });

  it('reads the old unlabelled layout with OCR slips', () => {
    const r = parsePan(L(`INCOME TAX DEPARTMENT ~ GOVT. OF INDIA
ANITA DEVI
MOHAN LAL
02/11/1990
Permanent Account Number
ABCPD5B78K
Signature`));
    expect(r.fields.number).toEqual({ value: 'ABCPD5878K', confidence: 'low' });
    expect(r.fields.name).toEqual({ value: 'Anita Devi', confidence: 'low' });
    expect(r.fields.fatherName.value).toBe('Mohan Lal');
    expect(r.fields.dob.value).toBe('1990-11-02');
  });
});

// Fake passport MRZ with correct ICAO check digits.
const MRZ1 = 'P<INDSHARMA<<ANITA<DEVI<<<<<<<<<<<<<<<<<<<<<';
const MRZ2 = 'Z1234567<1IND9002155F3307146<<<<<<<<<<<<<<08';

describe('parsePassport', () => {
  it('takes number, name, DOB and expiry from a clean MRZ', () => {
    const r = parsePassport(L(`REPUBLIC OF INDIA
Place of Issue / जारी करने का स्थान
LUCKNOW
Date of Issue / जारी करने की तिथि   Date of Expiry / समाप्ति की तिथि
15/07/2023   14/07/2033
${MRZ1}
${MRZ2}`), TODAY);
    expect(r.fields.number).toEqual({ value: 'Z1234567', confidence: 'high' });
    expect(r.fields.name.value).toBe('Anita Devi Sharma');
    expect(r.fields.dob).toEqual({ value: '1990-02-15', confidence: 'high' });
    expect(r.fields.expiry).toEqual({ value: '2033-07-14', confidence: 'high' });
    expect(r.fields.gender.value).toBe('Female');
    expect(r.fields.placeOfIssue.value).toBe('Lucknow');
    expect(r.fields.issueDate.value).toBe('2023-07-15');
  });

  it('copes with OCR noise in the MRZ (spaces, « for <<, K for filler)', () => {
    const noisy1 = 'P<INDSHARMA«ANITA<DEVI<<<<<<<<<<<<<<<<KKKKK';
    const noisy2 = 'Z1234567<1 IND 9002155F33O7146<<<<<<<<<<<<<<08';
    const lines = extractMrzLines(L(`${noisy1}\n${noisy2}`));
    expect(lines.line1).toBe(MRZ1);
    const r = parsePassport(L(`${noisy1}\n${noisy2}`), TODAY);
    expect(r.fields.number.value).toBe('Z1234567');
    expect(r.fields.expiry.value).toBe('2033-07-14');
  });

  it('marks the number low-confidence when its check digit fails', () => {
    const bad2 = MRZ2.replace('Z1234567<1', 'Z1234568<1');
    const r = parsePassport(L(`${MRZ1}\n${bad2}`), TODAY);
    expect(r.fields.number).toEqual({ value: 'Z1234568', confidence: 'low' });
    expect(r.fields.dob.confidence).toBe('high');
  });
});

describe('parseDrivingLicence', () => {
  it('reads a common card layout', () => {
    const r = parseDrivingLicence(L(`Indian Union Driving Licence
Issued by Government of Maharashtra
DL No : MH12 20110012345
Issue Date : 10-03-2011
Validity (NT) : 14-08-2040
Validity (TR) : ---
Name : RAMESH KUMAR
S/D/W of : SURESH KUMAR
DOB : 15-08-1985
Blood Group : B+`), TODAY);
    expect(r.fields.number).toEqual({ value: 'MH12 20110012345', confidence: 'high' });
    expect(r.fields.validTill).toEqual({ value: '2040-08-14', confidence: 'high' });
    expect(r.fields.name.value).toBe('Ramesh Kumar');
    expect(r.fields.dob.value).toBe('1985-08-15');
  });

  it('falls back leniently for unusual formats', () => {
    const r = parseDrivingLicence(L(`DRIVING LICENCE
DL No. TN/22/1234/2005
Valid Till 01/05/2035
Name ANITA DEVI`), TODAY);
    expect(r.fields.number).toEqual({ value: 'TN/22/1234/2005', confidence: 'low' });
    expect(r.fields.validTill.value).toBe('2035-05-01');
    expect(r.fields.validTill.confidence).toBe('low');
  });
});

describe('parseVoterId', () => {
  it('reads EPIC, elector and relative names', () => {
    const r = parseVoterId(L(`ELECTION COMMISSION OF INDIA
IDENTITY CARD
XYZ1234567
Elector's Name : Ramesh Kumar
Father's Name : Suresh Kumar
Sex / Gender : Male
Date of Birth : 15/08/1985`), TODAY);
    expect(r.fields.number.value).toBe('XYZ1234567');
    expect(r.fields.name.value).toBe('Ramesh Kumar');
    expect(r.fields.fatherName.value).toBe('Suresh Kumar');
    expect(r.fields.gender.value).toBe('Male');
    expect(r.fields.dob.value).toBe('1985-08-15');
  });
});

describe('parseBank', () => {
  it('reads a passbook first page', () => {
    const r = parseBank(L(`STATE BANK OF INDIA
Branch : Gomti Nagar, Lucknow
IFSC : SBIN0001234
Name : RAMESH KUMAR
A/c No : 12345678901
Mobile : 9876543210`));
    expect(r.fields.ifsc.value).toBe('SBIN0001234');
    expect(r.fields.bank.value).toBe('State Bank of India');
    expect(r.fields.accountNumber).toEqual({ value: '12345678901', confidence: 'high' });
    expect(r.fields.name.value).toBe('Ramesh Kumar');
  });

  it('picks an unlabelled account number from a cheque, ignoring phone numbers', () => {
    const r = parseBank(L(`Example Co-operative Bank Ltd
IFS Code: EXMP0000042
9876543210
PAY ________
50100123456789 SAVINGS`));
    expect(r.fields.ifsc.value).toBe('EXMP0000042');
    expect(r.fields.bank).toEqual({ value: 'Example Co-operative Bank Ltd', confidence: 'low' });
    expect(r.fields.accountNumber).toEqual({ value: '50100123456789', confidence: 'low' });
  });
});

describe('detectDocKind', () => {
  it('detects each kind from typical text', () => {
    expect(detectDocKind(AADHAAR_FRONT).kind).toBe('aadhaar');
    expect(detectDocKind(AADHAAR_BACK).kind).toBe('aadhaar');
    expect(detectDocKind('INCOME TAX DEPARTMENT\nPermanent Account Number\nABCPK1234F').kind).toBe('pan');
    expect(detectDocKind(`REPUBLIC OF INDIA\n${MRZ1}\n${MRZ2}`).kind).toBe('passport');
    expect(detectDocKind('Union of India Driving Licence\nMH12 20110012345').kind).toBe('drivingLicence');
    expect(detectDocKind('ELECTION COMMISSION OF INDIA\nXYZ1234567').kind).toBe('voterId');
    expect(detectDocKind('Savings Bank Passbook\nIFSC SBIN0001234').kind).toBe('bank');
  });

  it('returns null for unrelated text', () => {
    expect(detectDocKind('Electricity bill for August').kind).toBe(null);
    expect(detectDocKind('').kind).toBe(null);
  });

  it('maps editable type names back to kinds', () => {
    expect(kindFromTypeName('Aadhaar Card')).toBe('aadhaar');
    expect(kindFromTypeName('PAN Card')).toBe('pan');
    expect(kindFromTypeName('Passport')).toBe('passport');
    expect(kindFromTypeName('Driving Licence')).toBe('drivingLicence');
    expect(kindFromTypeName('Voter ID')).toBe('voterId');
    expect(kindFromTypeName('Bank Account')).toBe('bank');
    expect(kindFromTypeName('Class 10 Marksheet')).toBe(null);
    expect(kindFromTypeName('Company panel')).toBe(null);
    const types = [{ id: 'a', name: 'Other' }, { id: 'b', name: 'Aadhaar Card' }];
    expect(findTypeForKind(types, 'aadhaar').id).toBe('b');
    expect(findTypeForKind(types, 'pan')).toBe(null);
  });
});
