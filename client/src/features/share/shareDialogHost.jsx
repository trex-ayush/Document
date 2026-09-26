import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import ShareDialog from './ShareDialog.jsx';

/**
 * Renders the share dialog in its own small React root attached to <body>, so `ShareButton`
 * works anywhere — including as an item inside a `Dropdown` menu, which unmounts its items the
 * moment one is tapped (an in-place dialog would vanish with the menu). The dialog only needs
 * i18n and toasts (both global) plus the app's query cache, which the caller hands over.
 */
let root = null;
let current = null;
let openCount = 0;

function render() {
  if (!root) {
    const el = document.createElement('div');
    el.setAttribute('data-share-dialog-host', '');
    document.body.appendChild(el);
    root = createRoot(el);
  }
  const { queryClient, props, isOpen, key } = current;
  root.render(
    <QueryClientProvider client={queryClient}>
      <ShareDialog key={key} {...props} isOpen={isOpen} onClose={closeShareDialog} />
    </QueryClientProvider>,
  );
}

/** Opens the share dialog. `props`: { targetType, targetId, fileIds?, targetLabel? }. */
export function openShareDialog(props, queryClient) {
  openCount += 1;
  current = { props, queryClient, isOpen: true, key: openCount };
  render();
}

function closeShareDialog() {
  if (!current?.isOpen) return;
  current = { ...current, isOpen: false };
  render();
}
