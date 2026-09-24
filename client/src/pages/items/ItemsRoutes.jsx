import { Route, Routes } from 'react-router-dom';
import ItemsList from './ItemsList.jsx';
import ItemNew from './ItemNew.jsx';
import ItemDetail from './ItemDetail.jsx';
import ItemEdit from './ItemEdit.jsx';

/**
 * Route element for `/items/*`, lazy-loaded from AppRouter.jsx (already wired by the lead — see
 * docs/ITEMS.md "Client"). Nested `<Routes>` here match relative to that `items/*` mount point.
 */
export default function ItemsRoutes() {
  return (
    <Routes>
      <Route index element={<ItemsList />} />
      <Route path="new" element={<ItemNew />} />
      <Route path=":id" element={<ItemDetail />} />
      <Route path=":id/edit" element={<ItemEdit />} />
    </Routes>
  );
}
