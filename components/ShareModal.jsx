'use client';

import { Modal } from './ui';

/**
 * Hand a prepared message to WhatsApp, SMS or the clipboard.
 *
 * Shared by receipts, quotes and balance reminders — all three are the same
 * gesture: the system writes the message, a person presses send.
 */
export default function ShareModal({ share, title = 'Send to customer', onClose }) {
  if (!share) return null;

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-3">
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-page p-3 text-sm">
          {share.message}
        </pre>

        <div className="grid gap-2">
          {share.whatsappUrl ? (
            <a href={share.whatsappUrl} target="_blank" rel="noreferrer" className="btn-good w-full">
              Open in WhatsApp
            </a>
          ) : (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              This customer has no phone number saved, so there is nobody to send it to. Add one on their record, then
              try again.
            </p>
          )}

          {share.smsUrl ? (
            <a href={share.smsUrl} className="btn-secondary w-full">
              Send as SMS
            </a>
          ) : null}

          <button onClick={() => navigator.clipboard?.writeText(share.message)} className="btn-ghost w-full">
            Copy message
          </button>
        </div>
      </div>
    </Modal>
  );
}
