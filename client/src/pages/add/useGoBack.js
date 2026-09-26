import { useNavigate } from 'react-router-dom';

/**
 * "Cancel"/back for the add and edit pages: returns to the previous screen, or to `fallback`
 * when the page was opened directly (a fresh tab has no in-app history to go back to).
 */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  return () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
