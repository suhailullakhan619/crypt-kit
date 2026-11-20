import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumn, FileDown } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { usePermission } from '../hooks/usePermission';
import { impactPreview, generateImpact } from '../api/pantry';
import { downloadReport } from '../api/reports';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Skeleton, Table, THead, TBody, TR, TH, TD } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { EmptyCrypt } from '../components/spooky';
import { currentMonth } from '../lib/pantry';
import { errorMessage } from '../lib/utils';

const pct = (r) => `${(r * 100).toFixed(1)}%`;

function Stat({ label, value, hint }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/**
 * Monthly impact report (Req 7.1): pick a month, preview the numbers, generate the PDF.
 * Coordinator and Board only. The PDF is also listed on the Reports page.
 */
export default function Impact() {
  const api = useApi();
  const qc = useQueryClient();
  const { role, isSuperuser } = usePermission();
  const [month, setMonth] = useState(currentMonth());
  const allowed = isSuperuser || role === 'Board';

  const preview = useQuery({ queryKey: ['impact', month], queryFn: () => impactPreview(api, month), enabled: allowed && /^\d{4}-\d{2}$/.test(month) });

  const generate = useMutation({
    mutationFn: () => generateImpact(api, month),
    onSuccess: async (report) => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      toast.success(`${report.title} is ready`);
      try { await downloadReport(api, report); } catch (err) { toast.error(errorMessage(err)); }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!allowed) {
    return <Card><EmptyCrypt title="The impact report is for coordinators and the board">Your dashboard shows this month at a glance.</EmptyCrypt></Card>;
  }
  const a = preview.data;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Impact report"
        description="One click from shelf to grant report: what came in, what went out, who we reached."
        icon={<ChartColumn className="h-6 w-6 text-primary" />}
        actions={
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); generate.mutate(); }}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="impact-month" className="text-xs text-muted-foreground">Month</Label>
              <Input id="impact-month" type="month" value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)} required className="w-44" />
            </div>
            <Button type="submit" disabled={generate.isPending || !month}>
              <FileDown className="h-4 w-4" aria-hidden /> {generate.isPending ? 'Conjuring PDF…' : 'Generate PDF'}
            </Button>
          </form>
        }
      />

      {preview.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : preview.isError ? (
        <Card><p className="p-5 text-sm text-destructive">{errorMessage(preview.error)}</p></Card>
      ) : a && (
        <>
          <section aria-label="Impact at a glance" className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Units in" value={a.unitsIn} />
            <Stat label="Units out" value={a.unitsOut} hint={`${a.distributions} distributions`} />
            <Stat label="Households" value={a.households} hint="served (distinct)" />
            <Stat label="People reached" value={a.people} />
            <Stat label="Waste rate" value={pct(a.wasteRate)} hint={`${a.wasteUnits} units expired or discarded`} />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Distributions per week</CardTitle><CardDescription>{a.month}</CardDescription></CardHeader>
              <CardContent>
                <div className="h-56" role="img" aria-label={`Distributions per week: ${a.weekly.map((w) => `${w.label} ${w.distributions}`).join(', ')}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={a.weekly} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" interval={0} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--card-foreground))' }} />
                      <Bar dataKey="distributions" name="Distributions" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>By category</CardTitle><CardDescription>Units received and distributed</CardDescription></CardHeader>
              <CardContent className="px-0 md:px-0">
                <Table>
                  <THead><TR className="hover:bg-transparent"><TH>Category</TH><TH className="text-right">In</TH><TH className="text-right">Out</TH></TR></THead>
                  <TBody>
                    {a.byCategory.map((c) => (
                      <TR key={c.category}><TD>{c.category}</TD><TD className="text-right tabular-nums">{c.received}</TD><TD className="text-right tabular-nums">{c.distributed}</TD></TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Top donors</CardTitle><CardDescription>By units received this month</CardDescription></CardHeader>
            <CardContent>
              {a.topDonors.length === 0 ? <p className="text-sm text-muted-foreground">No donations recorded this month.</p> : (
                <ol className="flex flex-col gap-2">
                  {a.topDonors.map((d, i) => (
                    <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{i + 1}</span>{d.name}</span>
                      <span className="tabular-nums text-muted-foreground">{d.units} units · {d.lots} lots</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">Aggregates only — the report never contains household codes.</p>
        </>
      )}
    </div>
  );
}
