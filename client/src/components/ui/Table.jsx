/**
 * Table — shared data-table primitive (members list, activity log, share
 * access log, document-type field editor, etc.).
 *
 * Ported from apps/template/src/components/ui/Table.jsx, with the drag-drop
 * reorder feature (`onDragEnd`, `@hello-pangea/dnd`) and the dual-scrollbar /
 * header-tooltip helpers dropped — this app has no Kanban-style reorder
 * requirement and neither dependency is in docs/DECISIONS.md's client
 * dependency list. Header tooltips fall back to a plain `title` attribute
 * instead of the template's `InstantTooltip` component. Everything else
 * (sort, row click, expandable rows, compact/bordered/overflowVisible modes)
 * is preserved.
 *
 * Column: { key, label, align?, width?, sortable?, tooltip?, render?(row, i), cellClassName?, headerClassName?, cellStyle? }
 *
 * Props: rows, rowKey?, onRowClick?, rowClassName?, sort?, onSortChange?,
 * stickyHeader?, emptyMessage?, className?, bordered? (default true),
 * compact?, overflowVisible?, minWidth?, expandedRows?, onToggleExpand?,
 * renderExpanded?
 *
 * @example
 * <Table
 *   rows={members}
 *   rowKey={(m) => m.id}
 *   columns={[
 *     { key: 'name', label: 'Name', sortable: true },
 *     { key: 'role', label: 'Role', render: (m) => <Badge>{m.role}</Badge> },
 *   ]}
 *   emptyMessage="No members yet"
 * />
 */
const isRowExpanded = (row, key, expandedRows) => {
  if (!expandedRows) return false;
  if (expandedRows instanceof Set) return expandedRows.has(key);
  if (typeof expandedRows === 'object') return !!expandedRows[key];
  return false;
};

const Table = ({
  columns,
  rows = [],
  rowKey,
  onRowClick,
  rowClassName,
  sort,
  onSortChange,
  stickyHeader = false,
  emptyMessage = 'No data',
  className = '',
  bordered = true,
  compact = false,
  overflowVisible = false,
  minWidth,
  expandedRows,
  onToggleExpand,
  renderExpanded,
}) => {
  const getKey = (row, i) => {
    if (rowKey) return rowKey(row);
    return row?.id ?? row?._id ?? `r-${i}`;
  };

  const handleSort = (col) => {
    if (!col.sortable || !onSortChange) return;
    if (sort?.key === col.key) {
      onSortChange({ key: col.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      onSortChange({ key: col.key, dir: 'asc' });
    }
  };

  const alignClass = (a) => (a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left');
  const cellPadY = compact ? 'py-2' : 'py-4';

  const wrapperClass = bordered
    ? `bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 ${overflowVisible ? '' : 'overflow-hidden'} ${className}`
    : className;

  const tableStyle = minWidth != null ? { minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth } : undefined;

  const renderCell = (c, row, i) => (
    <td
      key={c.key}
      className={`px-3 sm:px-6 ${cellPadY} text-sm text-neutral-900 dark:text-neutral-100 ${alignClass(c.align)} ${c.cellClassName || ''}`}
      style={overflowVisible ? { overflow: 'visible', ...c.cellStyle } : c.cellStyle}
    >
      {c.render ? c.render(row, i) : row[c.key]}
    </td>
  );

  const renderHeader = () => (
    <thead className={`bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
      <tr>
        {columns.map((c) => {
          const sortable = c.sortable && onSortChange;
          const active = sort?.key === c.key;
          return (
            <th
              key={c.key}
              title={c.tooltip}
              className={`px-3 sm:px-6 py-3 text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap ${alignClass(c.align)} ${sortable ? 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-neutral-700' : ''} ${c.headerClassName || c.cellClassName || ''}`}
              onClick={() => handleSort(c)}
            >
              <span className={`inline-flex items-center gap-1 ${c.align === 'center' ? 'justify-center' : c.align === 'right' ? 'justify-end' : ''}`}>
                {c.label}
                {sortable && (
                  <svg
                    className={`w-3 h-3 transition-transform ${active ? 'text-neutral-900 dark:text-white' : 'text-neutral-300 dark:text-neutral-600'} ${active && sort.dir === 'desc' ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                )}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );

  const renderRow = (row, i) => {
    const key = getKey(row, i);
    const extra = typeof rowClassName === 'function' ? rowClassName(row, i) : '';
    const expanded = isRowExpanded(row, key, expandedRows);
    const expandable = !!renderExpanded;
    const wantsRowHandler = onRowClick || (onToggleExpand && expandable);
    const onClickHandler = wantsRowHandler
      ? (e) => {
          if (onToggleExpand && expandable && !e.target.closest('[data-no-expand]')) onToggleExpand(row);
          if (onRowClick) onRowClick(row);
        }
      : undefined;

    const rowEl = (
      <tr
        key={key}
        onClick={onClickHandler}
        className={`hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors ${wantsRowHandler ? 'cursor-pointer' : ''} ${extra}`}
        style={overflowVisible ? { overflow: 'visible' } : undefined}
      >
        {columns.map((c) => renderCell(c, row, i))}
      </tr>
    );

    if (!expandable) return rowEl;
    return (
      <>
        {rowEl}
        {expanded && (
          <tr key={`${key}-expanded`}>
            <td colSpan={columns.length} className="p-0 bg-neutral-50 dark:bg-neutral-900/30">
              {renderExpanded(row, i)}
            </td>
          </tr>
        )}
      </>
    );
  };

  const renderBody = () => {
    if (rows.length === 0) {
      return (
        <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
          <tr>
            <td colSpan={columns.length} className="px-3 sm:px-6 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {emptyMessage}
            </td>
          </tr>
        </tbody>
      );
    }
    return (
      <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
        {rows.map((row, i) => renderRow(row, i))}
      </tbody>
    );
  };

  const tableEl = (
    <table className="w-full" style={tableStyle}>
      {columns.some((c) => c.width != null) && (
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={c.width != null ? { width: typeof c.width === 'number' ? `${c.width}px` : c.width } : undefined} />
          ))}
        </colgroup>
      )}
      {renderHeader()}
      {renderBody()}
    </table>
  );

  const innerScrollClass = overflowVisible ? '' : 'overflow-x-auto';

  return <div className={wrapperClass}><div className={innerScrollClass}>{tableEl}</div></div>;
};

export default Table;
