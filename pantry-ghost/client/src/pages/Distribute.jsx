import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { HandHeart, ArrowLeft, ArrowRight, Check, Wand2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { usePermission } from '../hooks/usePermission';
import { useMeta } from '../context/MetaContext';
import { planDistribution, commitDistribution } from '../api/pantry';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Skeleton, Badge } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { EmptyCrypt } from '../components/spooky';
import { HouseholdPicker } from '../components/pantry/HouseholdPicker';
import { ItemChips } from '../components/pantry/ItemChips';
import { PickList } from '../components/pantry/PickList';
import { cn, errorMessage, humanise } from '../lib/utils';

const STEPS = ['Household', 'Items', 'Pick list'];

/**
 * FEFO distribution (Req 5.6): 1. household → 2. items → 3. pick list (oldest food first,
 * grouped by location) → Confirm. Confirm stays blocked while anything is short.
 */
export default function Distribute() {
  const api = useApi();
  const qc = useQueryClient();
  const meta = useMeta();
  const { can } = usePermission();
  const [step, setStep] = useState(0);
  const [household, setHousehold] = useState(null);
  const [items, setItems] = useState({});
  const [plan, setPlan] = useState(null);
  const [ticked, setTicked] = useState(new Set());

  const categories = meta.resource('stock-lots')?.fields.find((f) => f.name === 'category')?.values ?? [];
  const request = (it = items) => Object.entries(it).map(([category, quantity]) => ({ category, quantity }));

  const planner = useMutation({
    mutationFn: (it) => planDistribution(api, { householdId: household._id, items: request(it) }),
    onSuccess: (p) => { setPlan(p); setTicked(new Set()); setStep(2); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const commit = useMutation({
    mutationFn: () => commitDistribution(api, { householdId: household._id, lines: plan.lines.map(({ lotId, quantity }) => ({ lotId, quantity })) }),
    onSuccess: (d) => {
      toast.success(`Box packed for ${household.code} — ${d.totalUnits} units`);
      qc.invalidateQueries({ queryKey: ['r', 'stock-lots'] });
      qc.invalidateQueries({ queryKey: ['r', 'distributions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setStep(0); setHousehold(null); setItems({}); setPlan(null);
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      if (err?.response?.status === 409) planner.mutate(items); // stock moved under us: re-plan
    },
  });

  if (meta.loading) return <Skeleton className="h-64 w-full" />;
  if (!can('households', 'read') || !can('stock-lots', 'update')) {
    return <Card><EmptyCrypt title="Distribution is for coordinators and volunteers">Board members can follow the impact on the dashboard and in the impact report.</EmptyCrypt></Card>;
  }

  /** Shrink the request to what the plan could actually find, then re-plan. */
  const adjustToStock = () => {
    const planned = {};
    for (const l of plan.lines) {
      const c = request()[l.ask]?.category;
      if (c) planned[c] = (planned[c] ?? 0) + l.quantity;
    }
    setItems(planned);
    planner.mutate(planned);
  };

  const total = plan?.lines.reduce((s, l) => s + l.quantity, 0) ?? 0;
  const short = (plan?.shortfalls.length ?? 0) > 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Distribute" description="Pack a box: the ghost picks the food that expires first." icon={<HandHeart className="h-6 w-6 text-primary" />} />

      <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined}
            className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium sm:text-sm', i === step ? 'border-primary bg-primary/10 text-primary' : i < step ? 'text-foreground' : 'text-muted-foreground')}>
            <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs', i < step && 'border-primary bg-primary text-primary-foreground')}>
              {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className="truncate">{s}</span>
          </li>
        ))}
      </ol>

      <Card>
        {step === 0 && (
          <>
            <CardHeader><CardTitle>Who is this box for?</CardTitle><CardDescription>Households are known only by their code.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <HouseholdPicker selected={household} onSelect={setHousehold} />
              <div className="flex justify-end">
                <Button disabled={!household} onClick={() => setStep(1)}>Next: items <ArrowRight className="h-4 w-4" aria-hidden /></Button>
              </div>
            </CardContent>
          </>
        )}

        {step === 1 && household && (
          <>
            <CardHeader>
              <CardTitle>What goes in the box for {household.code}?</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-1.5">
                {household.size} {household.size === 1 ? 'person' : 'people'}
                {(household.dietary ?? []).map((d) => <Badge key={d} variant="accent">{humanise(d)}</Badge>)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ItemChips categories={categories} items={items} onChange={setItems} dietary={household.dietary ?? []} />
              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Button>
                <Button disabled={Object.keys(items).length === 0 || planner.isPending} onClick={() => planner.mutate(items)}>
                  {planner.isPending ? 'Planning…' : <>Plan pick list <ArrowRight className="h-4 w-4" aria-hidden /></>}
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {step === 2 && plan && (
          <>
            <CardHeader>
              <CardTitle>Pick list for {household.code}</CardTitle>
              <CardDescription>{total} units · oldest food first · tick lots off as you pick ({ticked.size}/{plan.lines.length})</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PickList plan={plan} ticked={ticked} onToggle={(i) => setTicked((t) => { const n = new Set(t); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
              <div className="flex flex-col-reverse justify-between gap-2 sm:flex-row">
                <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" aria-hidden /> Change items</Button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {short && plan.lines.length > 0 && (
                    <Button variant="outline" onClick={adjustToStock} disabled={planner.isPending}><Wand2 className="h-4 w-4" aria-hidden /> Use what we have</Button>
                  )}
                  <Button onClick={() => commit.mutate()} disabled={short || plan.lines.length === 0 || commit.isPending}>
                    {commit.isPending ? 'Packing…' : <><Check className="h-4 w-4" aria-hidden /> Confirm distribution</>}
                  </Button>
                </div>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
