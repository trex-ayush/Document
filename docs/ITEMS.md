# Items — full contract (Items module)

Non-file vault items: password/login entries, numeric records/IDs, and secure notes. Owned
independently of the document/folder module (`docs/API.md` "Documents"/"Folders") so it never
blocks or gets blocked by those modules — see docs/DECISIONS.md "Items module" for why this exists
as a separate module and what it reuses from Documents (field encryption, the masking pattern).

Model: `VaultItem` (`server/src/models/VaultItem.js`). Routes: `server/src/modules/items/routes.js`,
mounted at `/api/items` in `server/src/app.js`. Client: `client/src/pages/items/**`,
`client/src/features/items/**`, `client/src/services/itemsApi.js`.

## Data model

A `VaultItem` is a `kind` (`login` | `record` | `note`) + a `title` + an arbitrary ordered list of
`fields`. There is **no per-kind schema** — a login's password, a record's ID number, and a secure
note's body are all just one more entry in the same `fields[]` array (same shape as
`Document.customFields`, reused on purpose): `{ key, value, type, sensitive, order }`. `kind` only
steers what the client offers/labels by default (e.g. a login form pre-seeds `username`/
`password`/`website` fields; a note form shows one big `sensitive:true` textarea field). Sensitive
field values are encrypted at rest exactly like a sensitive `Document.customFields` value —
`FIELD_ENCRYPTION_KEY`, AES-256-GCM, `utils/crypto.js#encryptFieldValue`/`decryptFieldValue`.

Every item belongs to a folder (`folderId`, required — same invariant as `Document.folderId`) and
optionally a family member (`memberId`). `tags` is a plain string array, same convention as
Documents.

## Routes — `/items` (all require auth; write routes require `requireWrite`)

### GET /items?q=&folderId=&kind=&memberId=&tag=&page=&limit=
`{ items: [ItemSummary], page, limit, total, totalPages }` — same pagination envelope as
`GET /documents`. `q` does a text search over title/tags/field keys/field values (weighted, same
pattern as the Document search index) — sensitive field ciphertext is included in the index exactly
as Documents does for `customFields.value`, matching that existing precedent rather than special
casing text search per sensitivity.

`memberId` is a Membership id, or the literal `none` for only items not tied to any member
(`memberId: null`) — same convention as `GET /documents`.

`ItemSummary`: `{ id, kind, title, folderId, memberId, tags, fieldCount, preview, updatedAt }`.
`preview`: up to 2 **non-sensitive** `{ key, value }` pairs — enough for a list card (ItemCard) to
show something useful without ever shipping a sensitive value outside the detail/reveal routes.

### GET /items/:id
Full detail: `{ id, kind, title, folderId, memberId, tags, fields, createdAt, updatedAt }`.
`fields[]`: `{ id, key, type, order, sensitive, value }` for a non-sensitive field, or
`{ id, key, type, order, sensitive: true, hasValue, masked }` for a sensitive one (masked = dots +
last 4 plaintext chars, decrypted server-side just long enough to compute the mask — same pattern
as `GET /documents/:id`'s `customFields`). Plaintext is never present here.

### POST /items
Write. Body: `{ title, folderId, kind, memberId?, tags?, fields?: [{key,value,type,sensitive}] }`.
Response `201`: full item detail. Errors: `404 FOLDER_NOT_FOUND`, `404 MEMBER_NOT_FOUND`.

### PATCH /items/:id
Write. Body (partial): `{ title?, folderId?, kind?, memberId?, tags?, fields? }` — `fields`, when
present, **replaces the whole array** (client sends the full edited list, same convention as
`PATCH /documents/:id`'s `customFields`).

### DELETE /items/:id
Write. `204`.

### GET /items/:id/fields/:fieldId/reveal
The **only** route that ever returns a sensitive field's plaintext. Same reauth gate as
`GET /documents/:id/fields/:fieldId/reveal`: when `Family.settings.requireReauthForSecrets` is true
(default), requires header `X-Reauth: <reauthToken>` from `POST /auth/reauth` —
`401 { code: 'REAUTH_REQUIRED' }` otherwise. Response: `{ "value": "decrypted plaintext" }`. Logs
`field.reveal` (`targetType: 'item'`, meta `{ key }` — never the value). Rate-limited per member.

### GET /items/:id/activity
`{ items: [Activity] }` — this item only (`targetType: 'item'`), newest first, capped at 200.

## Activity actions this module logs
`item.create`, `item.update` (+ a second `field.update` entry when `fields` changed, meta `{keys}}` —
matches the Document convention of never logging a changed value, only which keys changed),
`item.delete`, `field.reveal`.

## Integration seam — `server/src/modules/items/integration.js`

Other modules call these instead of importing `VaultItem`/`items/**` directly, so this module stays
a drop-in nobody else needs to touch:

- `listItemsInFolder(familyId, folderId)` — items directly inside one folder (`folderId: 'root'` or
  omitted → `[]`, since items — like documents — always belong to a real folder). Powers
  `GET /browse`'s `items: []` (`server/src/modules/folders/routes.js`).
- `searchItems(familyId, q, { limit })` — merged into `GET /documents`'s `itemResults` for a single
  global-search call across documents and items.
- `countItemsByKind(familyId)` — `{ login, record, note }` counts, powers `GET /stats`'s
  `itemsByKind`.
- `deleteItemsInFolders(familyId, folderIds)` — used by the folders module's recursive
  `DELETE /folders/:id` to remove every item inside the deleted subtree. Returns the count removed.
- `moveItemsFolderCheck(familyId, folderId)` — always a no-op (see the function's own doc comment):
  `VaultItem.folderId` is a required reference, so an item can never be orphaned by a folder move
  (the folder's `parentId` changes, not the item's `folderId`) or by a folder delete (the folders
  module calls `deleteItemsInFolders` first in that case). Kept for the seam's stable-signature
  contract rather than removed.
- `getItemForShare(familyId, itemId, { includeSensitive })` — loads one item for the shares module
  (`targetType: 'item'`, `docs/API.md` "Shares"). Returns `{ title, kind, tags, fields }` (never
  `familyId`/`folderId`/`memberId`/`createdBy`) or `null` if not found. `includeSensitive: true` is
  only ever passed once the shares module has already enforced its own invariants (a share
  password AND expiry <=24h) — this function does not re-check them.

## Client

- `client/src/services/itemsApi.js` — one function per route above.
- `client/src/features/items/ItemCard.jsx` — list/grid card (kind icon, title, up to 2 preview
  fields, copy actions). Consumes `ItemSummary`.
- `client/src/pages/items/ItemsRoutes.jsx` — mounted at `/items/*` (`client/src/routes/AppRouter.jsx`,
  already wired by the lead). Routes:
  - `/items` — all-items list (search/filter by kind/folder/tag), since Browse (a later-phase page)
    doesn't exist yet and users otherwise have no way to reach an item once created.
  - `/items/new?kind=login|record|note` — matches `Fab.jsx`'s "Add password/login" /
    "Add number/record" / "Add secure note" actions exactly.
  - `/items/:id` — detail view, reveal-on-demand for sensitive fields (via `POST /auth/reauth` +
    the `X-Reauth` header, same flow as a Document's sensitive custom field).
  - `/items/:id/edit` — edit form, same field editor as `/items/new`.
