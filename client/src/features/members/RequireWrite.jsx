import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, House } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import PageContainer from '@/components/ui/PageContainer.jsx';
import { useCanWrite } from '@/hooks/useCanWrite.js';

/**
 * Wraps a page that only works with write access (adding, editing, the Shares page). A
 * view-only member who opens it (an old link, a bookmark) gets a friendly explanation instead of
 * a form whose Save the server would refuse.
 */
export default function RequireWrite({ children }) {
  const { t } = useTranslation('members');
  const canWrite = useCanWrite();
  if (canWrite) return children;
  return (
    <PageContainer>
      <EmptyState
        icon={<Eye />}
        title={t('viewOnly.title', 'You can view only')}
        description={t(
          'viewOnly.description',
          'Your family admin gave you view-only access: you can open and download everything, but not add, change or share. Ask them if you need more.',
        )}
        action={
          <Button as={Link} to="/" leftIcon={<House className="h-4 w-4" aria-hidden="true" />}>
            {t('viewOnly.goHome', 'Go home')}
          </Button>
        }
      />
    </PageContainer>
  );
}
