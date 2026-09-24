import express from 'express';

// OWNED BY THE ITEMS AGENT (not Agent A/B/C/D). Builds VaultItem (login/record/note "items")
// as its own module: server/src/modules/items/** + server/src/models/VaultItem.js. See
// docs/API.md "Items" and docs/ITEMS.md (owner writes this doc) for the contract.
const router = express.Router();

export default router;
