import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input, Label } from '../ui/input';
import { useLabMutations } from '../../hooks/useLabMutations';

/** Reject a pending request with a required reason (lab-ledger Req 3.6). */
export function RejectDialog({ checkout, open, onOpenChange }) {
  const [reason, setReason] = useState('');
  const { reject } = useLabMutations();

  const submit = (e) => {
    e.preventDefault();
    reject.mutate({ id: checkout._id, reason: reason.trim() }, { onSuccess: () => { onOpenChange(false); setReason(''); } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject request</DialogTitle>
          <DialogDescription>
            {checkout?.borrower?.name ?? 'The borrower'} asked for {checkout?.equipment?.name ?? 'this item'}. They will see your reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Input id="reject-reason" required maxLength={300} placeholder="e.g. Booked for an exam that week" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Keep request</Button>
            <Button type="submit" variant="destructive" disabled={reject.isPending || !reason.trim()}>Reject</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
