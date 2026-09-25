import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Folder } from 'lucide-react';

/** "📁 Shared > Papa" — each folder links to its Browse page. `path` comes from `useFolderPath`. Sits in PageHeader's breadcrumb slot, which sets the size and colour. */
export default function FolderBreadcrumb({ path }) {
  if (!path?.length) return null;
  return (
    <nav className="flex flex-wrap items-center gap-1">
      <Folder className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      {path.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />}
          <Link to={`/browse/${p.id}`} className="hover:text-neutral-800 hover:underline dark:hover:text-neutral-200">
            {p.name}
          </Link>
        </Fragment>
      ))}
    </nav>
  );
}
