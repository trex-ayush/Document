// STUB — OWNED BY THE ITEMS AGENT. Used by Agent E's Browse grid/list to render a vault item
// (login/record/note) alongside folders and documents. Replace with the real card: kind icon,
// service+username (login) or first two non-sensitive fields (record), copy actions, etc.
export default function ItemCard({ item }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-card dark:border-neutral-700">
      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{item?.title || 'Untitled item'}</p>
    </div>
  );
}
