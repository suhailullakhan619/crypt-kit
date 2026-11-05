import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search, UserPlus, Check } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { usePermission } from '../../hooks/usePermission';
import { useMeta } from '../../context/MetaContext';
import { listRecords, createRecord } from '../../api/resources';
import { Input, Label } from '../ui/input';
import { Button } from '../ui/button';
import { Badge, Skeleton } from '../ui/display';
import { cn, errorMessage, humanise } from '../../lib/utils';

/**
 * Step 1 of Distribute (Req 5.6): find a household by code, or register a new one with only a
 * size and dietary needs — never a name or address.
 * @param {{ selected: object|null, onSelect: (household: object) => void }} props
 */
export function HouseholdPicker({ selected, onSelect }) {
  const api = useApi();
  const qc = useQueryClient();
  const meta = useMeta();
  const { can } = usePermission();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [size, setSize] = useState('2');
  const [dietary, setDietary] = useState([]);
  const flags = meta.resource('households')?.fields.find((f) => f.name === 'dietary')?.values ?? [];

  const list = useQuery({
    queryKey: ['r', 'households', { q, limit: 8 }],
    queryFn: () => listRecords(api, 'households', { q, limit: 8, sort: 'code' }),
  });

  const create = useMutation({
    mutationFn: () => createRecord(api, 'households', { size: Number(size), dietary }),
    onSuccess: (hh) => {
      toast.success(`Household ${hh.code} registered`);
      qc.invalidateQueries({ queryKey: ['r', 'households'] });
      setCreating(false);
      setDietary([]);
      onSelect(hh);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="household-search">Household code</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="household-search" className="pl-9" placeholder="H-0042" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Households">
          {(list.data?.items ?? []).map((h) => {
            const on = selected?._id === h._id;
            return (
              <li key={h._id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSelect(h)}
                  className={cn('flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-primary/60', on && 'border-primary bg-primary/10')}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-mono text-sm font-semibold">{h.code}</span>
                    <span className="text-xs text-muted-foreground">{h.size} {h.size === 1 ? 'person' : 'people'}</span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {(h.dietary ?? []).map((d) => <Badge key={d} variant="accent">{humanise(d)}</Badge>)}
                    {on && <Check className="h-4 w-4 text-primary" aria-hidden />}
                  </span>
                </button>
              </li>
            );
          })}
          {list.data?.items?.length === 0 && <li className="text-sm text-muted-foreground">No household matches “{q}”.</li>}
        </ul>
      )}

      {can('households', 'create') && (creating ? (
        <form
          className="flex flex-col gap-3 rounded-lg border border-dashed p-4"
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          aria-label="New household"
        >
          <p className="text-sm text-muted-foreground">We record only how many people and their dietary needs — no names or addresses.</p>
          <div className="flex max-w-[10rem] flex-col gap-1.5">
            <Label htmlFor="new-household-size">People</Label>
            <Input id="new-household-size" type="number" min="1" max="20" value={size} onChange={(e) => setSize(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <span id="new-household-dietary" className="text-sm font-medium">Dietary needs</span>
            <div role="group" aria-labelledby="new-household-dietary" className="flex flex-wrap gap-2">
              {flags.map((f) => {
                const on = dietary.includes(f);
                return (
                  <button key={f} type="button" aria-pressed={on} onClick={() => setDietary(on ? dietary.filter((x) => x !== f) : [...dietary, f])}
                    className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary/15 text-primary' : 'hover:bg-muted')}>
                    {humanise(f)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending || !(Number(size) >= 1 && Number(size) <= 20)}>{create.isPending ? 'Registering…' : 'Register household'}</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setCreating(true)}><UserPlus className="h-4 w-4" aria-hidden /> New household</Button>
      ))}
    </div>
  );
}
