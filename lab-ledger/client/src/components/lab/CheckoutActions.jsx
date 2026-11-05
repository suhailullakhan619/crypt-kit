import { useState } from 'react';
import { Check, X, Undo2, Ban } from 'lucide-react';
import { Button } from '../ui/button';
import { useAuth } from '../../context/AuthContext';
import { useLabMutations } from '../../hooks/useLabMutations';
import { isStaff, OUT_STATUSES } from '../../lib/lab';
import { ReturnDialog } from './ReturnDialog';
import { RejectDialog } from './RejectDialog';

const idOf = (ref) => (ref && typeof ref === 'object' ? String(ref._id ?? '') : String(ref ?? ''));

/**
 * Workflow buttons for one checkout, shown only to users who may use them (hide, don't disable):
 *  - Approve / Reject: staff, on Requested
 *  - Cancel: the borrower, on Requested (staff reject instead)
 *  - Record return: staff, on Active / Overdue
 */
export function CheckoutActions({ checkout, size = 'sm' }) {
  const { user } = useAuth();
  const { approve, cancel } = useLabMutations();
  const [returning, setReturning] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  if (!checkout) return null;

  const staff = isStaff(user?.role);
  const mine = idOf(checkout.borrower) === String(user?.userId);
  const pending = checkout.status === 'Requested';
  const out = OUT_STATUSES.includes(checkout.status);
  const what = checkout.equipment?.name ?? 'item';

  const buttons = [];
  if (pending && staff) {
    buttons.push(
      <Button key="approve" size={size} disabled={approve.isPending} onClick={() => approve.mutate(checkout._id)} aria-label={`Approve request for ${what}`}>
        <Check className="h-4 w-4" aria-hidden /> Approve
      </Button>,
      <Button key="reject" size={size} variant="outline" onClick={() => setRejecting(true)} aria-label={`Reject request for ${what}`}>
        <X className="h-4 w-4" aria-hidden /> Reject
      </Button>
    );
  }
  if (pending && mine) {
    buttons.push(
      <Button key="cancel" size={size} variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(checkout._id)} aria-label={`Cancel request for ${what}`}>
        <Ban className="h-4 w-4" aria-hidden /> Cancel request
      </Button>
    );
  }
  if (out && staff) {
    buttons.push(
      <Button key="return" size={size} variant="secondary" onClick={() => setReturning(true)} aria-label={`Record return of ${what}`}>
        <Undo2 className="h-4 w-4" aria-hidden /> Record return
      </Button>
    );
  }
  if (!buttons.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {buttons}
      {staff && <ReturnDialog checkout={checkout} open={returning} onOpenChange={setReturning} />}
      {staff && <RejectDialog checkout={checkout} open={rejecting} onOpenChange={setRejecting} />}
    </div>
  );
}
