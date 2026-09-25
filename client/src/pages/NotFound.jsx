import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { House } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState.jsx';
import Button from '@/components/ui/Button.jsx';

/**
 * Friendly 404 for any unknown URL (AppRouter's `*` route). Lives outside AppShell — an old or
 * mistyped link can be opened with or without a session — so it carries its own full-page
 * background and one obvious way out: "Go home" (ProtectedRoute sends a signed-out visitor on to
 * the login page from there).
 */
export default function NotFound() {
  const { t } = useTranslation('common');
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-neutral-50 px-4 py-10 dark:bg-neutral-950">
      <EmptyState
        variant="plain"
        image="/assets/empty-404.png"
        title={t('notFoundPage.title', "We can't find that page")}
        description={t('notFoundPage.description', 'The link may be old or typed wrong. Let’s get you back home.')}
        action={
          <Button as={Link} to="/" leftIcon={<House className="h-4 w-4" aria-hidden="true" />}>
            {t('notFoundPage.action', 'Go home')}
          </Button>
        }
      />
    </div>
  );
}
