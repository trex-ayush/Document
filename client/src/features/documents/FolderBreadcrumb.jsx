import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Folder } from 'lucide-react';

/** "📁 Shared › Papa" — each folder links to its Browse page. `path` comes from `useFolderPath`. */
export default function FolderBreadcrumb({ path }) {
  if (!path?.length) return null;
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
      <Folder className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      {path.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && <span aria-hidden="true">›</span>}
          <Link to={`/browse/${p.id}`} className="hover:text-neutral-800 hover:underline dark:hover:text-neutral-200">
            {p.name}
          </Link>
        </Fragment>
      ))}
    </nav>
  );
}
