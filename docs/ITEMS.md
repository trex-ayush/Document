# Items — passwords and notes

Everything that isn't a file: saved passwords (`kind: 'login'`) and written notes (`kind: 'note'`).
Model: `VaultItem` (`server/src/models/VaultItem.js`). Routes: `server/src/modules/items/routes.js`,
mounted at `/api/items`. Responses are built only in `server/src/modules/items/serializer.js`.
Client: `client/src/pages/add/AddPassword.jsx`, `AddNote.jsx`, `client/src/pages/items/**`,
`client/src/features/items/**`, `client/src/services/itemsApi.js`.

## Data model

| Field | Password (`login`) | Note (`note`) |
| --- | --- | --- |
| `title` | required | required |
| `username` | username / email | — |
| `password` | the password | — |
| `fields` | extra `{ key, value, secret }` rows ("+ Add field", e.g. `ATM PIN: 4321`) | — |
| `notes` | free text | free text |

- `username`, `password`, each field `value` and `notes` are **encrypted at rest** (AES-256-GCM,
  `FIELD_ENCRYPTION_KEY`, `utils/crypto.js`). Field keys and the title are plain text.
- **Keep secret** (`fields[].secret`, boolean): a secret field's value is masked on the item page
  (like the password) and is **never searched** — only its key can match, and the snippet shows
  just the key. When `secret` is omitted on create/update it defaults to whether the key looks
  sensitive — whole words, any case: `pin`, `mpin`, `tpin`, `password`, `passcode`, `passwd`,
  `pwd`, `otp`, `cvv`, `cvc`, `secret`, "security … answer", `पिन`, `पासवर्ड` (so "ATM PIN" and
  "UPI pin" are secret). An explicit `false` wins. The rule lives in `modules/items/sensitiveKey.js`,
  mirrored byte-for-byte in `client/src/features/items/sensitiveKey.js` (a server test checks it).
- Fields saved before `secret` existed have no `secret` in the database (and the schema has no
  default, so Mongoose doesn't fill one in): they **read** as `secret = isSensitiveKey(key)` —
  no migration needed. Responses always include `secret` as a boolean.
- Every item lives in a folder (`folderId` is required in the model). Omitting it on create — or
  sending `null` / `"root"` — puts the item in the family's **Shared** folder.
- A note never keeps login-only values: saving an item as `note` clears `username`, `password` and
  `fields`.
- Deleting moves the item to the Bin (`deletedAt`), like documents and folders.

## Routes — `/items`

All routes need auth + `X-Family-Id`; create, update and delete need write access.

`ItemSummary` (lists, browse): `{ id, kind, title, folderId, username, hasPassword, fields, notes,
createdAt, updatedAt }` — everything except the password itself.

### GET /items?folderId=&kind=&page=&limit=
`{ items: [ItemSummary], page, limit, total, totalPages }`, newest first. `folderId` = directly in
that folder; `kind` = `login` | `note`.

### GET /items/:id
Full item: `ItemSummary` + `password` (plain text) + `breadcrumbs` + `createdByName` / `updatedByName`
(the member's name, or `null` when unknown or never changed — only on this GET). Members see the
password straight away — there is no re-auth step. Logs `item.view`. Errors: `404 ITEM_NOT_FOUND`.

### POST /items
Write. Body: `{ kind, title, folderId?, username?, password?, fields?: [{ key, value, secret? }], notes? }`
(`title` 1–200 chars, up to 50 fields, `notes` up to 20 000 chars; `secret` omitted = from the key,
see "Keep secret" above). Response `201`: full item.
Errors: `400 VALIDATION_ERROR`, `404 FOLDER_NOT_FOUND`.

### PATCH /items/:id
Write. Any of `{ kind, title, folderId, username, password, fields, notes }`. `fields`, when sent,
replaces the whole list. `folderId: null` / `"root"` moves the item into Shared. Response: full item.

### DELETE /items/:id
Write. Moves the item to the Bin. `204`.

### GET /items/:id/activity
`{ items: [Activity] }` for this item only, newest first, capped at 200.

## Search

`GET /api/search` (docs/API.md "Search") matches item titles, usernames, notes, field keys and the
values of non-secret fields — case-insensitive, part of a word. The password and secret field values
are never searched or shown in a snippet.

## Sharing

Items are never shared. A share link (document or folder) shows only titles and files, so passwords
and notes can't leak through it.

## Activity actions

`item.create`, `item.update`, `item.delete`, `item.view`, `item.restore` (from the Bin). Values are
never written to the activity log.

## Client

- `/add/password`, `/add/note` — the add pages (from "+ Add"; `?folderId=` preselects the folder,
  otherwise "Saving in: Shared").
- `/items/:id` — detail: the password and every secret field are masked (`••••••••`) with **Show**
  and **Copy**; every other value has Copy. Buttons: Edit, Move, Delete.
- `/items/:id/edit` — the same form as the add page (`features/items/ItemForm.jsx`, with
  `FieldRows.jsx` for the "+ Add field" rows). Each row has a lock switch, **Keep secret**
  (`aria-pressed`); it turns on by itself while the key looks sensitive, until the user flips it for
  that row. A secret value is typed in a hidden box with an eye to show it.
