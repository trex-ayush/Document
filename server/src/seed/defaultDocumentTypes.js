// Default DocumentType templates seeded for every new family by seedFamilyDefaults.js (with
// `defaultFolderId: null` — new families start with no folders). Field shape matches models/DocumentType.js:
// { key, type, sensitive }. `sensitive: true` marks the one identifying-number field of each ID
// document, per the build brief; everything else defaults to type:'text', sensitive:false unless
// noted (DOB/dates -> type:'date').
export const DEFAULT_DOCUMENT_TYPES = [
  {
    name: 'Aadhaar Card',
    icon: 'id-card',
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
    fields: [
      { key: 'DL Number', type: 'text', sensitive: true },
      { key: 'Valid Till', type: 'date', sensitive: false },
    ],
  },
  {
    name: 'Voter ID',
    icon: 'vote',
    fields: [{ key: 'EPIC Number', type: 'text', sensitive: false }],
  },
  {
    name: 'Class 10 Marksheet',
    icon: 'graduation-cap',
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
    fields: [
      { key: 'Board', type: 'text', sensitive: false },
      { key: 'Roll Number', type: 'text', sensitive: false },
      { key: 'Year', type: 'text', sensitive: false },
      { key: 'Percentage', type: 'text', sensitive: false },
    ],
  },
  { name: 'Photograph', icon: 'image', fields: [] },
  { name: 'Signature', icon: 'signature', fields: [] },
  {
    name: 'Bank Account',
    icon: 'bank',
    fields: [
      { key: 'Bank', type: 'text', sensitive: false },
      { key: 'Account Number', type: 'text', sensitive: true },
      { key: 'IFSC', type: 'text', sensitive: false },
    ],
  },
  { name: 'Other', icon: 'file', fields: [] },
];
