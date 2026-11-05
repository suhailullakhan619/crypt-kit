import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Mic, Square, PackagePlus, Plus, Send, Loader2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { usePermission } from '../hooks/usePermission';
import { useDictation } from '../hooks/useDictation';
import { useMeta } from '../context/MetaContext';
import { listRecords } from '../api/resources';
import { parseIntake, saveIntake } from '../api/pantry';
import { PageHeader } from '../components/layout/AppShell';
import { Card, Skeleton } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { EmptyCrypt } from '../components/spooky';
import { DraftRow } from '../components/pantry/DraftRow';
import { toRow, fromRow, missingFields } from '../lib/pantry';
import { cn, errorMessage } from '../lib/utils';

const enumValues = (resource, name, fallback) => resource?.fields.find((f) => f.name === name)?.values ?? fallback;

/**
 * Donation intake (Req 4.6): speak or type what arrived; every utterance becomes an editable draft
 * row; "Save all" is the explicit confirmation that writes stock.
 */
export default function Intake() {
  const api = useApi();
  const qc = useQueryClient();
  const meta = useMeta();
  const { can } = usePermission();
  const location = useLocation();
  const dictation = useDictation();
  const [rows, setRows] = useState(() => (location.state?.draft ? [toRow(location.state.draft)] : []));
  const [text, setText] = useState('');
  const [rowError, setRowError] = useState(null);

  const lots = meta.resource('stock-lots');
  const enums = {
    category: enumValues(lots, 'category', []),
    unit: enumValues(lots, 'unit', ['item']),
    location: enumValues(lots, 'location', ['Shelf']),
  };
  const donors = useQuery({
    queryKey: ['r', 'donors', { limit: 100, sort: 'name' }],
    queryFn: () => listRecords(api, 'donors', { limit: 100, sort: 'name' }),
    enabled: can('donors', 'read'),
  });

  const parse = useMutation({
    mutationFn: (t) => parseIntake(api, t),
    onSuccess: (draft) => {
      setRows((r) => [...r, toRow(draft)]);
      setText('');
      if (draft.missing.length) toast(`Added a draft — ${draft.missing.length} field${draft.missing.length === 1 ? '' : 's'} to check`, { icon: '👻' });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const save = useMutation({
    mutationFn: () => saveIntake(api, rows.map(fromRow)),
    onSuccess: (items) => {
      toast.success(`${items.length} lot${items.length === 1 ? '' : 's'} tucked into the pantry`);
      setRows([]);
      setRowError(null);
      qc.invalidateQueries({ queryKey: ['r', 'stock-lots'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => {
      const index = err?.response?.data?.index;
      setRowError(Number.isInteger(index) ? { key: rows[index]?.key, message: errorMessage(err) } : null);
      toast.error(errorMessage(err));
    },
  });

  if (meta.loading) return <Skeleton className="h-64 w-full" />;
  if (!can('stock-lots', 'create')) {
    return <Card><EmptyCrypt title="Intake is for coordinators and volunteers">Ask a coordinator if you need to log donations.</EmptyCrypt></Card>;
  }

  const submitText = (e) => {
    e.preventDefault();
    if (text.trim()) parse.mutate(text.trim());
  };
  const onMic = async () => {
    try {
      const heard = await dictation.toggle();
      if (heard) parse.mutate(heard);
    } catch (err) {
      toast.error(err?.name === 'NotAllowedError' ? 'Microphone permission was denied. You can type instead.' : errorMessage(err));
    }
  };
  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const incomplete = rows.filter((r) => missingFields(r).length > 0).length;
  const busy = parse.isPending || dictation.busy;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Intake"
        description="Say what arrived — “twelve cans of black beans expiring March 3rd from Fresh Mart” — then check and save."
        icon={<PackagePlus className="h-6 w-6 text-primary" />}
      />

      <Card className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-end">
        {dictation.available && (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onMic}
              disabled={busy}
              aria-label={dictation.listening ? 'Stop dictation' : 'Start dictation'}
              aria-pressed={dictation.listening}
              className={cn(
                'grid h-20 w-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 disabled:opacity-60',
                dictation.listening && 'animate-pulse-glow'
              )}
            >
              {dictation.listening ? <Square className="h-8 w-8" /> : busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Mic className="h-9 w-9" />}
            </button>
            <span aria-live="polite" className="text-xs text-muted-foreground">{dictation.listening ? 'Listening…' : busy ? 'Thinking…' : 'Tap to speak'}</span>
          </div>
        )}
        <form onSubmit={submitText} className="flex w-full flex-1 items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="intake-text" className="text-xs text-muted-foreground">{dictation.available ? 'Or type it' : 'Type what arrived'}</Label>
            <Input id="intake-text" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="e.g. 2 kg apples from Green Valley Farm best before next Friday" />
          </div>
          <Button type="submit" disabled={!text.trim() || busy} aria-label="Add draft">
            {parse.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            <span className="hidden sm:inline">Add</span>
          </Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyCrypt title="No drafts yet" action={<Button variant="outline" onClick={() => setRows([toRow({})])}><Plus className="h-4 w-4" aria-hidden /> Add a blank row</Button>}>
            Each thing you say or type becomes a draft here. Nothing is saved until you press Save all.
          </EmptyCrypt>
        </Card>
      ) : (
        <section aria-label="Drafts" className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <DraftRow
              key={row.key}
              row={row}
              index={i}
              enums={enums}
              donors={donors.data?.items ?? []}
              onChange={(patch) => update(row.key, patch)}
              onRemove={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              serverError={rowError?.key === row.key ? rowError.message : undefined}
            />
          ))}
          <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-lg border bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {rows.length} draft{rows.length === 1 ? '' : 's'}
              {incomplete > 0 && <span className="text-warning"> · {incomplete} need{incomplete === 1 ? 's' : ''} a look</span>}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRows((r) => [...r, toRow({})])}><Plus className="h-4 w-4" aria-hidden /> Blank row</Button>
              <Button onClick={() => save.mutate()} disabled={incomplete > 0 || save.isPending}>
                {save.isPending ? 'Saving…' : `Save all (${rows.length})`}
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
