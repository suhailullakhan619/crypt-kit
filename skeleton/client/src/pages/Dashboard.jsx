import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlarmClock, CalendarClock } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useMeta } from '../context/MetaContext';
import { getDashboard } from '../api/dashboard';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Skeleton, Badge, Table, THead, TBody, TR, TH, TD } from '../components/ui/display';
import { ResourceIcon, EmptyCrypt } from '../components/spooky';
import { ActivityTimeline } from '../components/resource/ActivityTimeline';
import { humanise } from '../lib/utils';

// App panels: client/src/dashboard/<key>.jsx (Req 16.7). Missing → generic table.
const panelModules = import.meta.glob('../dashboard/*.jsx', { eager: true });
const panelComponent = (key) => panelModules[`../dashboard/${key}.jsx`]?.default ?? null;

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

function GenericPanel({ data }) {
  const rows = Array.isArray(data) ? data : data?.rows ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nothing to show.</p>;
  const cols = Object.keys(rows[0]).filter((k) => k !== '_id');
  return (
    <Table>
      <THead><TR>{cols.map((c) => <TH key={c}>{humanise(c)}</TH>)}</TR></THead>
      <TBody>{rows.map((r, i) => <TR key={r._id ?? i}>{cols.map((c) => <TD key={c}>{String(r[c] ?? '—')}</TD>)}</TR>)}</TBody>
    </Table>
  );
}

function StatCard({ r }) {
  return (
    <Link to={`/r/${r.key}`} className="group">
      <Card className="h-full p-5 transition-colors group-hover:border-primary/60">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><ResourceIcon name={r.icon} /> {r.label}</span>
        </div>
        <p className="mt-3 font-display text-4xl font-semibold tabular-nums">{r.total}</p>
        {r.hasDue && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={r.overdue ? 'destructive' : 'muted'}><AlarmClock className="h-3 w-3" aria-hidden /> {r.overdue} overdue</Badge>
            <Badge variant={r.dueSoon ? 'warning' : 'muted'}><CalendarClock className="h-3 w-3" aria-hidden /> {r.dueSoon} due this week</Badge>
          </div>
        )}
      </Card>
    </Link>
  );
}

function BreakdownChart({ r }) {
  const b = r.breakdowns[0];
  if (!b) return null;
  const data = Object.entries(b.counts).map(([name, value]) => ({ name: humanise(name), value }));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{r.label} by {b.label.toLowerCase()}</CardTitle>
        <CardDescription>{total} records</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-52" role="img" aria-label={`${r.label} by ${b.label}: ${data.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" interval={0} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--card-foreground))' }} />
              <Bar dataKey="value" name="Records" radius={[6, 6, 0, 0]}>
                {data.map((d, i) => <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/** Dashboard (Req 9.3, 9.4, 16.7). */
export default function Dashboard() {
  const api = useApi();
  const { user } = useAuth();
  const meta = useMeta();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => getDashboard(api) });

  const attention = (data?.resources ?? []).filter((r) => r.overdue || r.dueSoon);
  const firstName = user?.name?.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up at the witching hour' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${greeting}${firstName ? `, ${firstName}` : ''}`} description={`Here's what's stirring in ${meta.appName || 'the crypt'}.`} />

      <section aria-label="Totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? [0, 1, 2].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-9 w-16" /><Skeleton className="mt-4 h-5 w-40" /></Card>)
          : data?.resources.map((r) => <StatCard key={r.key} r={r} />)}
      </section>

      {!isLoading && data?.resources.length === 0 && (
        <Card><EmptyCrypt title="No records you can see yet">Ask an admin for access, or add a resource definition.</EmptyCrypt></Card>
      )}

      {(data?.panels ?? []).map((p) => {
        const Panel = panelComponent(p.key);
        return (
          <Card key={p.key}>
            <CardHeader><CardTitle>{p.title}</CardTitle></CardHeader>
            <CardContent>{Panel ? <Panel data={p.data} /> : <GenericPanel data={p.data} />}</CardContent>
          </Card>
        );
      })}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {isLoading ? <Card className="p-5"><Skeleton className="h-52 w-full" /></Card> : data?.resources.map((r) => <BreakdownChart key={r.key} r={r} />)}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>Overdue and due in the next 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-16 w-full" /> : attention.length === 0 ? (
                <p className="text-sm text-muted-foreground">All quiet in the graveyard. 🌙</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {attention.map((r) => (
                    <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <Link to={`/r/${r.key}`} className="flex min-w-[6rem] flex-1 items-center gap-2 text-sm font-medium hover:text-primary">
                        <ResourceIcon name={r.icon} /> <span className="truncate">{r.label}</span>
                      </Link>
                      <span className="flex flex-wrap gap-1.5">
                        {r.overdue > 0 && <Badge variant="destructive">{r.overdue} overdue</Badge>}
                        {r.dueSoon > 0 && <Badge variant="warning">{r.dueSoon} soon</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
            <CardContent>{isLoading ? <Skeleton className="h-32 w-full" /> : <ActivityTimeline items={data?.recent} />}</CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
