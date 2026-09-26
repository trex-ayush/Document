import { describe, it, expect } from 'vitest';
import { detectDocKind } from '../detectType.js';
import { parseReads } from '../parseDocument.js';

// Invented OCR output in the shape Tesseract gives for phone screenshots and card photos.
// 523478912345 passes the Aadhaar checksum; ABCPD1234E is PAN-shaped with a valid holder letter.

const GOOGLE_CHAT = `9:41 4G 72%
← Rahul Verma
Active now
RV Hey did you send the KYC docs to HR?
10:02 AM
Yes sent. Ref ABCPD 1234E and TKT-88213
OK THANKS BRO. Meeting at 3PM in ROOM B204
PNR 4521789630 CONFIRMED
Rahul reacted
Google Chat
Reply`;

const WHATSAPP = `WhatsApp
Mummy
online
Beta aadhaar card ki photo bhejo
11:20 AM
OK MAA, SENDING NOW
Photo
DCIM IMG 20260926 WA0012 JPG
Type a message`;

const BANK_SMS = `VM-SBIUPI
Dear Customer, Rs.5,000.00 debited from A/c XX1234 on 25-09-26
to VPA rahul@okhdfcbank UPI Ref no 523478912345.
Not you? Call 18001234000 to report. -SBI Bank
Today 9:14 PM`;

const AADHAAR_SCREENSHOT = `10:15 VoLTE 56%
भारत सरकार
Government of India
Sunita Singh
जन्म तिथि/DOB: 02/11/1968
महिला / FEMALE
5234 7891 2345
आधार - आम आदमी का अधिकार
ABCPD 1234E DOWNLOAD SHARE PDF`;

const PAN_CARD = `आयकर विभाग INCOME TAX DEPARTMENT
भारत सरकार GOVT. OF INDIA
स्थायी लेखा संख्या कार्ड
Permanent Account Number Card
ABCPK1234F
नाम / Name
RAMESH KUMAR
Date of Birth
15/08/1985`;

// Same card photographed badly: stray symbols, one word lost, look-alikes in the number.
const PAN_CARD_NOISY = `| INC0ME TAX DEPARTMENT ~~ GOVT. OF lNDIA
; Permanent Account Number Card :
ABCPKl234F
Name
RAMESH KUMAR
Father's Name
SURESH KUMAR
15/08/1985 .`;

const lines = (text) => text.split('\n').map((t) => ({ text: t, confidence: 88 }));

describe('detectDocKind never guesses', () => {
  it('names nothing for chat and SMS screenshots, even with PAN-shaped words and valid-looking numbers', () => {
    expect(detectDocKind(GOOGLE_CHAT).kind).toBe(null);
    expect(detectDocKind(WHATSAPP).kind).toBe(null);
    expect(detectDocKind(BANK_SMS).kind).toBe(null);
  });

  it('never calls a PAN-shaped word a PAN card without the PAN card wording', () => {
    const r = detectDocKind('ABCPK1234F');
    expect(r.kind).toBe(null);
    expect(r.scores.pan).toBe(0);
    expect(detectDocKind('Permanent Account Number').scores.pan).toBe(0);
  });

  it('picks Aadhaar for an Aadhaar screenshot with noisy capitals, not PAN', () => {
    const r = detectDocKind(AADHAAR_SCREENSHOT);
    expect(r.kind).toBe('aadhaar');
    expect(r.scores.pan).toBe(0);
  });

  it('still picks Aadhaar when the number is misread, from the card wording and its DOB/gender lines', () => {
    expect(detectDocKind(AADHAAR_SCREENSHOT.replace('5234 7891 2345', '5234 7891 2346')).kind).toBe('aadhaar');
    expect(detectDocKind('Government of India\nAnita Devi\nDOB: 01/01/1990\nFEMALE').kind).toBe('aadhaar');
  });

  it('picks PAN for a real PAN card, clean or noisy', () => {
    expect(detectDocKind(PAN_CARD).kind).toBe('pan');
    expect(detectDocKind(PAN_CARD_NOISY).kind).toBe('pan');
  });

  it('keeps a chat screenshot untyped end to end, so the title stays the file name', () => {
    const r = parseReads([{ lines: lines(GOOGLE_CHAT) }]);
    expect(r.kind).toBe(null);
    expect(parseReads([{ lines: lines(AADHAAR_SCREENSHOT) }]).kind).toBe('aadhaar');
    expect(parseReads([{ lines: lines(PAN_CARD_NOISY) }]).fields.number.value).toBe('ABCPK1234F');
  });
});
