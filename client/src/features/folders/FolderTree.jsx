import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildFolderTree, ROOT_ID } from './folderTreeUtils.js';

/**
 * Recursive folder tree. Two jobs, one component:
 *  - Navigation tree (AppShell desktop sidebar slot via `useAppShell().setSidebarSlot()`,
 *    and inline on mobile Browse — docs/UI_KIT.md §7.1 / §7.9).
 *  - Selection tree inside `FolderPicker` (move-folder / move-document), via
 *    `selectable` + `disabledIds`.
 *
 * `folders` is the flat list from `GET /folders/tree`.
 */
export default function FolderTree({
  folders = [],
  activeId = null,
  onSelect,
  selectable = false,
  disabledIds,
  className = '',
}) {
  const { t } = useTranslation(['browse', 'common']);
  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  return (
    <nav className={`text-sm ${className}`} aria-label={t('tree.ariaLabel', 'Folders')}>
      <TreeNode
        node={{ id: ROOT_ID, name: t('allFolders', 'All folders'), children: tree, icon: null, color: null }}
        depth={0}
        activeId={activeId}
        onSelect={onSelect}
        selectable={selectable}
        disabledIds={disabledIds}
        isRoot
      />
    </nav>
  );
}

function TreeNode({ node, depth, activeId, onSelect, selectable, disabledIds, isRoot }) {
  const { t } = useTranslation('common');
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isActive = activeId === node.id;
  const isDisabled = disabledIds?.has(node.id);

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg pr-2 ${
          isActive ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        } ${isDisabled ? 'opacity-40' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? t('actions.collapse', 'Collapse') : t('actions.expand', 'Expand')}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        ) : (
          <span className="h-11 w-11 flex-shrink-0" />
        )}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => !isDisabled && onSelect?.(node.id)}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left disabled:cursor-not-allowed"
        >
          {!isRoot && (
            <span
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: node.color || '#A8A29E' }}
              aria-hidden="true"
            />
          )}
          {!isRoot && node.icon && <span className="flex-shrink-0 text-sm leading-none">{node.icon}</span>}
          <span
            className={`truncate ${isActive ? 'font-semibold text-primary-700 dark:text-primary-300' : 'text-neutral-700 dark:text-neutral-200'} ${isRoot ? 'font-semibold' : ''}`}
          >
            {node.name}
          </span>
          {selectable && isActive && (
            <svg className="ml-auto h-4 w-4 flex-shrink-0 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
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
