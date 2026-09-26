import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import { DropdownItem } from '@/components/ui/Dropdown.jsx';
import Tooltip from '@/components/ui/Tooltip.jsx';
import { openShareDialog } from './shareDialogHost.jsx';
import { useCanWrite } from '@/hooks/useCanWrite.js';

/**
 * ShareButton — the single way to share a folder, a document or one file. Opens the share
 * dialog (what is being shared, "Link valid for", Create link → WhatsApp / Copy / Share).
 *
 * Props:
 *  - targetType: 'document' | 'folder'
 *  - targetId: string
 *  - fileIds?: string[] — share only these files of a document (e.g. a single file)
 *  - variant?: 'button' (default) | 'icon' | 'menuitem' (inside a `<Dropdown>`)
 *  - label?: button text (default "Share")
 *  - targetLabel?: name shown in the dialog (document title / folder name / file name)
 *  - className?, size? (button/icon variants)
 *
 * @example
 * <ShareButton targetType="document" targetId={doc.id} targetLabel={doc.title} />
 * <ShareButton targetType="document" targetId={doc.id} fileIds={[file.id]} variant="icon" />
 * <Dropdown trigger={...}><ShareButton variant="menuitem" targetType="folder" targetId={f.id} /></Dropdown>
 */
export default function ShareButton({
  targetType,
  targetId,
  fileIds,
  variant = 'button',
  label,
  targetLabel,
  className = '',
  size = 'md',
}) {
  const { t } = useTranslation('shares');
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  const text = label || t('button.share', 'Share');
  const tip = fileIds?.length ? t('tip.shareFile', 'Send this file to someone') : t('tip.share', 'Send this to someone');

  const open = (e) => {
    e?.stopPropagation?.();
    openShareDialog({ targetType, targetId, fileIds, targetLabel }, queryClient);
  };

  // View-only members can't make links (the server refuses), so there's no button.
  if (!canWrite) return null;

  if (variant === 'menuitem') {
    return (
      <DropdownItem onSelect={open} tip={tip}>
        <span className="flex items-center gap-2 whitespace-nowrap">
          <Share2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {text}
        </span>
      </DropdownItem>
    );
  }

  if (variant === 'icon') {
    return (
      // The wrapper carries `className` too, so e.g. `sm:hidden` hides it with its gap.
      <Tooltip content={tip} className={`inline-flex ${className}`}>
        <Button variant="ghost" size="icon" className={className} onClick={open} aria-label={text}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={tip}>
      <Button variant="secondary" size={size} className={className} onClick={open} leftIcon={<Share2 className="h-4 w-4" aria-hidden="true" />}>
        {text}
      </Button>
    </Tooltip>
  );
}
