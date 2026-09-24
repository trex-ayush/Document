// Signup-time default DocumentType templates. `folder` is a DEFAULT_FOLDERS name resolved to an
// id by seedFamilyDefaults.js — not persisted as-is. Field shape matches models/DocumentType.js:
// { key, type, sensitive }. `sensitive: true` marks the one identifying-number field of each ID
// document, per the build brief; everything else defaults to type:'text', sensitive:false unless
// noted (DOB/dates -> type:'date').
export const DEFAULT_DOCUMENT_TYPES = [
  {
    name: 'Aadhaar Card',
    icon: 'id-card',
    folder: 'Identity',
    fields: [
      { key: 'Aadhaar Number', type: 'text', sensitive: true },
      { key: 'Name', type: 'text', sensitive: false },
      { key: 'DOB', type: 'date', sensitive: false },
      { key: 'Address', type: 'text', sensitive: false },
    ],
  },
  {
    name: 'PAN Card',
    icon: 'credit-card',
    folder: 'Identity',
    fields: [
      { key: 'PAN Number', type: 'text', sensitive: true },
      { key: 'Name', type: 'text', sensitive: false },
      { key: "Father's Name", type: 'text', sensitive: false },
      { key: 'DOB', type: 'date', sensitive: false },
    ],
  },
  {
    name: 'Passport',
    icon: 'passport',
    folder: 'Identity',
    fields: [
      { key: 'Passport Number', type: 'text', sensitive: true },
      { key: 'Issue Date', type: 'date', sensitive: false },
      { key: 'Expiry Date', type: 'date', sensitive: false },
      { key: 'Place of Issue', type: 'text', sensitive: false },
    ],
  },
  {
    name: 'Driving Licence',
    icon: 'car',
    folder: 'Identity',
    fields: [
      { key: 'DL Number', type: 'text', sensitive: true },
      { key: 'Valid Till', type: 'date', sensitive: false },
    ],
  },
  {
    name: 'Voter ID',
    icon: 'vote',
    folder: 'Identity',
    fields: [{ key: 'EPIC Number', type: 'text', sensitive: false }],
  },
  {
    name: 'Class 10 Marksheet',
    icon: 'graduation-cap',
    folder: 'Education',
    fields: [
      { key: 'Board', type: 'text', sensitive: false },
      { key: 'Roll Number', type: 'text', sensitive: false },
      { key: 'Year', type: 'text', sensitive: false },
      { key: 'Percentage', type: 'text', sensitive: false },
    ],
  },
  {
    name: 'Class 12 Marksheet',
    icon: 'graduation-cap',
    folder: 'Education',
    fields: [
      { key: 'Board', type: 'text', sensitive: false },
      { key: 'Roll Number', type: 'text', sensitive: false },
      { key: 'Year', type: 'text', sensitive: false },
      { key: 'Percentage', type: 'text', sensitive: false },
    ],
  },
  { name: 'Photograph', icon: 'image', folder: 'Photos & Signatures', fields: [] },
  { name: 'Signature', icon: 'signature', folder: 'Photos & Signatures', fields: [] },
  {
    name: 'Bank Account',
    icon: 'bank',
    folder: 'Financial',
    fields: [
      { key: 'Bank', type: 'text', sensitive: false },
      { key: 'Account Number', type: 'text', sensitive: true },
      { key: 'IFSC', type: 'text', sensitive: false },
    ],
  },
  { name: 'Other', icon: 'file', folder: 'Other', fields: [] },
];
