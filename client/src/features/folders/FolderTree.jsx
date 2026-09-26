import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { folderColor, siblingColors } from './folderColors.js';
import { buildFolderTree, folderName, ROOT_ID } from './folderTreeUtils.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

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
  const topColors = useMemo(() => siblingColors(tree), [tree]);

  return (
    <nav className={`text-sm ${className}`} aria-label={t('tree.ariaLabel', 'Folders')}>
      {showRoot ? (
        <TreeNode node={{ id: ROOT_ID, name: t('tree.topLevel', 'Folders (top level)'), children: tree }} depth={0} isRoot {...nodeProps} />
      ) : (
        tree.map((node) => <TreeNode key={node.id} node={node} depth={0} colors={topColors} {...nodeProps} />)
      )}
    </nav>
  );
}

function TreeNode({ node, depth, activeId, onSelect, selectable, disabledIds, isRoot, colors }) {
  const { t } = useTranslation(['browse', 'common']);
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  // Same folder colours as the cards: handed out among each node's children.
  const childColors = useMemo(() => siblingColors(node.children || []), [node.children]);
  const isActive = activeId === node.id;
  const isDisabled = disabledIds?.has(node.id);
  const Icon = isActive ? FolderOpen : Folder;

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-lg pr-2 transition-colors ${
          isActive ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50'
        } ${isDisabled ? 'opacity-40' : ''}`}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {hasChildren ? (
          <Tooltip content={expanded ? t('tip.hideInside', 'Hide the folders inside') : t('tip.showInside', 'Show the folders inside')} className="inline-flex flex-shrink-0">
            <button
              type="button"
              aria-label={expanded ? t('common:actions.collapse', 'Collapse') : t('common:actions.expand', 'Expand')}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className="flex h-11 w-8 flex-shrink-0 items-center justify-center rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
            </button>
          </Tooltip>
        ) : (
          <span className="h-11 w-8 flex-shrink-0" />
        )}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => !isDisabled && onSelect?.(node.id)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-1.5 text-left disabled:cursor-not-allowed"
        >
          {!isRoot && <Icon className={`h-6 w-6 flex-shrink-0 ${folderColor(node, colors).icon}`} strokeWidth={1.75} aria-hidden="true" />}
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
              colors={childColors}
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
