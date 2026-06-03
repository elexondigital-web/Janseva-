import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { IconAlertTriangle } from './ui/Icon';

/**
 * Listens for the `janseva:session-expired` window event emitted by the
 * axios interceptor when a refresh-token call fails. Pops a modal,
 * counts down 3 seconds, then redirects to /login.
 *
 * Mounted once at the App level so it works regardless of which page
 * the user was on when the session died.
 */
export default function SessionExpiredModal() {
  const [open, setOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(3);

  useEffect(() => {
    const onExpire = () => {
      setSecondsLeft(3);
      setOpen(true);
    };
    window.addEventListener('janseva:session-expired', onExpire);
    return () =>
      window.removeEventListener('janseva:session-expired', onExpire);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (secondsLeft <= 0) {
      window.location.href = '/login';
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [open, secondsLeft]);

  if (!open) return null;

  return (
    <Modal
      open
      onClose={() => {
        // Closing immediately redirects — the user already lost auth.
        window.location.href = '/login';
      }}
      title="Your session has expired"
      subtitle="Please sign in again to continue"
      size="sm"
      footer={
        <button
          type="button"
          onClick={() => {
            window.location.href = '/login';
          }}
          className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark"
        >
          Go to login
        </button>
      }
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 shrink-0 rounded-full bg-status-amber-bg text-status-amber flex items-center justify-center">
          <IconAlertTriangle size={18} />
        </div>
        <div className="text-sm text-navy">
          We couldn't refresh your session. You'll be redirected to the login
          page in <strong>{secondsLeft}</strong> second
          {secondsLeft === 1 ? '' : 's'}.
        </div>
      </div>
    </Modal>
  );
}
