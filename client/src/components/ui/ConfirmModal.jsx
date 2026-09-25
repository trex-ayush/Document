/**
 * ConfirmModal — kept as a name for older call sites; it is the same component as
 * `ConfirmDrawer` (one confirmation look everywhere). Same props: isOpen, onClose, onConfirm
 * (may return a Promise), title, description?, confirmLabel?, cancelLabel?,
 * confirmVariant? ('danger' default), hideIcon?
 */
import ConfirmDrawer from './ConfirmDrawer.jsx';

export const ConfirmModal = ConfirmDrawer;
export default ConfirmDrawer;
