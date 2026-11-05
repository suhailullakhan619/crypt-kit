import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, Mic, Pencil, X } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { usePermission } from '../hooks/usePermission';
import { useDictation } from '../hooks/useDictation';
import { saveIntake } from '../api/pantry';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/display';
import { formatDate } from '../lib/format';
import { amount, MISSING_HINT } from '../lib/pantry';

const CONFIRM = /\b(confirm|confirmed|yes|save|save it|correct)\b/;
const CANCEL = /\b(cancel|no|stop|discard)\b/;

/**
 * Voice result renderer for INTAKE (Req 4.5, 6.1): a confirm card for the spoken draft.
 * Nothing is saved until the user explicitly confirms — by tapping Confirm or by saying "confirm".
 */
export default function IntakeConfirmCard({ result }) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermission();
  const dictation = useDictation();
  const [state, setState] = useState('pending'); // pending | saved | dismissed
  const draft = result?.data?.draft;

  const save = useMutation({
    mutationFn: () => saveIntake(api, [draft]),
    onSuccess: (items) => {
      setState('saved');
      toast.success(`${items.length} lot tucked into the pantry`);
      qc.invalidateQueries({ queryKey: ['r', 'stock-lots'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error ?? 'Could not save the draft'),
  });

  if (!draft || !can('stock-lots', 'create')) return null;
  const ready = draft.missing.length === 0;

  const listenForConfirm = async () => {
    try {
      const heard = ((await dictation.toggle()) ?? '').toLowerCase();
      if (CANCEL.test(heard)) setState('dismissed');
      else if (CONFIRM.test(heard) && ready) save.mutate();
      else if (heard) toast(`Heard “${heard}”. Say “confirm” to save, or edit it on screen.`, { icon: '👻' });
    } catch (err) {
      toast.error(err?.message ?? 'Microphone unavailable');
    }
  };

  if (state === 'dismissed') return <p className="text-sm text-muted-foreground">Draft discarded — nothing was saved.</p>;
  if (state === 'saved') return <p className="flex items-center gap-2 text-sm font-medium text-success"><Check className="h-4 w-4" aria-hidden /> Saved to stock.</p>;

  const rows = [
    ['Quantity', draft.quantity ? amount(draft.quantity, draft.unit) : null, 'quantity'],
    ['Item', draft.itemName, 'itemName'],
    ['Category', draft.category, 'category'],
    ['Expires', draft.expiresOn ? formatDate(draft.expiresOn) : draft.category === 'Hygiene' ? 'No expiry' : null, 'expiresOn'],
    ['Donor', draft.donorName ?? (draft.donorGuess ? `Not recognised: “${draft.donorGuess}”` : '—'), null],
    ['Location', draft.location, null],
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4" aria-label="Intake draft">
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([label, value, field]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={value ? 'font-medium' : 'font-medium text-warning'}>{value ?? MISSING_HINT[field]}</dd>
          </div>
        ))}
      </dl>
      {!ready && <Badge variant="warning" className="self-start">Fix the missing fields before saving</Badge>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save.mutate()} disabled={!ready || save.isPending}>
          <Check className="h-4 w-4" aria-hidden /> {save.isPending ? 'Saving…' : 'Confirm & save'}
        </Button>
        {dictation.available && ready && (
          <Button variant="secondary" onClick={listenForConfirm} disabled={save.isPending} aria-label={dictation.listening ? 'Stop listening' : 'Say confirm'}>
            <Mic className="h-4 w-4" aria-hidden /> {dictation.listening ? 'Listening…' : 'Say “confirm”'}
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate('/intake', { state: { draft } })}>
          <Pencil className="h-4 w-4" aria-hidden /> Edit on intake page
        </Button>
        <Button variant="ghost" onClick={() => setState('dismissed')}><X className="h-4 w-4" aria-hidden /> Discard</Button>
      </div>
    </div>
  );
}
