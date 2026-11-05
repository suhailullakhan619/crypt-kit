import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label, Textarea } from '../ui/input';
import { Select } from '../ui/select';
import { useLabMutations } from '../../hooks/useLabMutations';

const CONDITIONS = ['Good', 'Fair', 'Damaged'];

/**
 * Record a return (lab-ledger Req 3.5). Damaged items go to Maintenance; the dialog says so up front.
 */
export function ReturnDialog({ checkout, open, onOpenChange }) {
  const [condition, setCondition] = useState('Good');
  const [notes, setNotes] = useState('');
  const { giveBack } = useLabMutations();
  const name = checkout?.equipment?.name ?? 'this item';

  const submit = (e) => {
    e.preventDefault();
    giveBack.mutate({ id: checkout._id, condition, notes: notes.trim() || undefined }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record return of {name}</DialogTitle>
          <DialogDescription>Borrowed by {checkout?.borrower?.name ?? 'someone'}. Check it over before it goes back on the shelf.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="return-condition">Condition</Label>
            <Select id="return-condition" value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            {condition === 'Damaged' && (
              <p role="status" className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> It will be moved to Maintenance until repaired.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="return-notes">Notes (optional)</Label>
            <Textarea id="return-notes" maxLength={1000} placeholder="Scratches, missing probes, anything odd…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={giveBack.isPending}>{giveBack.isPending ? 'Saving…' : 'Record return'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
