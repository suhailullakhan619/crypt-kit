import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '../../hooks/useApi';
import { Button } from '../ui/button';
import { Input, PasswordInput, Label } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { errorMessage } from '../../lib/utils';

/** Top-bar "Change password" button and dialog (checks the current password on the server). */
export function ChangePasswordDialog() {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = (v) => { setOpen(v); if (!v) { setCurrent(''); setNext(''); setConfirm(''); setError(''); } };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      toast.success('Password changed');
      close(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Change password">
        <KeyRound className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Change password</DialogTitle>
              <DialogDescription>Enter your current password, then choose a new one (8 characters or more).</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="pw-current">Current password</Label>
              <PasswordInput id="pw-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pw-new">New password</Label>
              <PasswordInput id="pw-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <PasswordInput id="pw-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
