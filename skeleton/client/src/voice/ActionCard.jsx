import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, X } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { createRecord, updateRecord } from '../api/resources';
import { Button } from '../components/ui/button';
import { errorMessage } from '../lib/utils';

/**
 * Confirm card for a chat command ("add a note…", "remind me…", "log 30 minutes…", "mark N-0006 as done").
 * The assistant only drafts; nothing is saved until Confirm, and the save goes through the normal API,
 * so permissions and validation are the same as on the forms.
 * @param {{ result: { data?: { draft?: { type: 'create'|'update', resource: string, id?: string, body: object, summary: Array<{label: string, value: string}>, verb?: string } } } }} props
 */
export default function ActionCard({ result }) {
  const api = useApi();
  const qc = useQueryClient();
  const draft = result?.data?.draft;
  const [state, setState] = useState('pending'); // pending | saved | dismissed
  const [saved, setSaved] = useState(null);

  const save = useMutation({
    mutationFn: () => (draft.type === 'update' ? updateRecord(api, draft.resource, draft.id, draft.body) : createRecord(api, draft.resource, draft.body)),
    onSuccess: (item) => {
      setSaved(item);
      setState('saved');
      toast.success(draft.type === 'update' ? 'Updated' : 'Saved');
      qc.invalidateQueries({ queryKey: ['r', draft.resource] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!draft) return null;
  if (state === 'dismissed') return <p className="text-sm text-muted-foreground">Cancelled. Nothing was saved.</p>;
  if (state === 'saved') {
    return (
      <p className="flex items-center gap-2 text-sm" role="status">
        <Check className="h-4 w-4 text-success" aria-hidden /> Done.
        {saved?._id && <Link to={`/r/${draft.resource}/${saved._id}`} className="font-medium text-primary hover:underline">Open it</Link>}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary/40 bg-primary/5 p-4" role="group" aria-label="Confirm this change">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {draft.summary.map((s) => (
          <div key={s.label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</dt>
            <dd className="text-sm font-medium">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          <Check className="h-4 w-4" aria-hidden /> Confirm
        </Button>
        <Button variant="outline" onClick={() => setState('dismissed')} disabled={save.isPending}>
          <X className="h-4 w-4" aria-hidden /> Cancel
        </Button>
      </div>
    </div>
  );
}
