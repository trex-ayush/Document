import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { buildFolderTree, folderName, ROOT_ID } from './folderTreeUtils.js';

/**
 * Recursive folder tree, used by `FolderPicker` (move a folder / move a document).
 * `folders` is the flat list from `GET /folders/tree`. `showRoot` adds a "Folders (top level)"
 * node above everything — only meaningful when moving a folder, since documents, passwords and
 * notes always live inside a folder.
 */
export default function FolderTree({
  folders = [],
  activeId = null,
  onSelect,
  selectable = false,
  disabledIds,
  showRoot = true,
  className = '',
}) {
  const { t } = useTranslation(['browse', 'common']);
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const nodeProps = { activeId, onSelect, selectable, disabledIds };

  return (
    <nav className={`text-sm ${className}`} aria-label={t('tree.ariaLabel', 'Folders')}>
      {showRoot ? (
        <TreeNode node={{ id: ROOT_ID, name: t('tree.topLevel', 'Folders (top level)'), children: tree }} depth={0} isRoot {...nodeProps} />
      ) : (
        tree.map((node) => <TreeNode key={node.id} node={node} depth={0} {...nodeProps} />)
      )}
    </nav>
  );
}

function TreeNode({ node, depth, activeId, onSelect, selectable, disabledIds, isRoot }) {
  const { t } = useTranslation(['browse', 'common']);
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isActive = activeId === node.id;
  const isDisabled = disabledIds?.has(node.id);
  const Icon = isActive ? FolderOpen : Folder;

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-lg pr-2 ${
          isActive ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        } ${isDisabled ? 'opacity-40' : ''}`}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? t('common:actions.collapse', 'Collapse') : t('common:actions.expand', 'Expand')}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="flex h-10 w-8 flex-shrink-0 items-center justify-center rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
          </button>
        ) : (
          <span className="h-10 w-8 flex-shrink-0" />
        )}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => !isDisabled && onSelect?.(node.id)}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 py-1.5 text-left disabled:cursor-not-allowed"
        >
          {!isRoot && <Icon className="h-4 w-4 flex-shrink-0 text-neutral-400" aria-hidden="true" />}
          <span
            className={`truncate ${isActive ? 'font-semibold text-primary-700 dark:text-primary-300' : 'text-neutral-700 dark:text-neutral-200'} ${isRoot ? 'font-medium' : ''}`}
          >
            {isRoot ? node.name : folderName(node, t)}
          </span>
          {selectable && isActive && (
            <Check className="ml-auto h-4 w-4 flex-shrink-0 text-primary-500" strokeWidth={2.5} aria-hidden="true" />
          )}
        </button>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
              selectable={selectable}
              disabledIds={disabledIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
