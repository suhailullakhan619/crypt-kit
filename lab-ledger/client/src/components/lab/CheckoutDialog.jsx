import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input, Label } from '../ui/input';
import { useLabMutations } from '../../hooks/useLabMutations';
import { dueBackBounds, dueBackIso, MAX_LOAN_DAYS } from '../../lib/lab';

/**
 * "Request checkout" dialog (lab-ledger Req 3.1, 3.2): due-back date limited to the next 30 days
 * and an optional purpose. The borrower is always the signed-in user (set by the server).
 */
export function CheckoutDialog({ item, open, onOpenChange }) {
  const bounds = dueBackBounds();
  const [day, setDay] = useState(bounds.default);
  const [purpose, setPurpose] = useState('');
  const { request } = useLabMutations();

  const submit = (e) => {
    e.preventDefault();
    request.mutate(
      { equipmentId: item._id, dueBack: dueBackIso(day), purpose: purpose.trim() || undefined },
      { onSuccess: () => { onOpenChange(false); setPurpose(''); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request {item?.name}</DialogTitle>
          <DialogDescription>{item?.assetTag} · a technician approves the loan before you collect it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="due-back">Due back</Label>
            <Input id="due-back" type="date" required min={bounds.min} max={bounds.max} value={day} onChange={(e) => setDay(e.target.value)} />
            <p className="text-xs text-muted-foreground">Loans last at most {MAX_LOAN_DAYS} days.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purpose">Purpose (optional)</Label>
            <Input id="purpose" maxLength={200} placeholder="e.g. Optics practical, week 6" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={request.isPending || !day}>{request.isPending ? 'Sending…' : 'Send request'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
