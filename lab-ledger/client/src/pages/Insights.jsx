import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChartColumn, FileDown } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { downloadReport } from '../api/reports';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Skeleton, Table, THead, TBody, TR, TH, TD } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { EmptyCrypt } from '../components/spooky';
import { errorMessage } from '../lib/utils';

const USAGE = [30, 90, 365];
const LATE = [90, 180, 365];

function Stat({ label, value }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

function UsageTable({ title, rows, empty }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="px-0 md:px-0">
        {rows.length === 0 ? (
          <p className="px-5 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>Equipment</TH><TH>Tag</TH><TH className="text-right">Loans</TH><TH className="text-right">Days out</TH></TR></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.equipmentId}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="text-muted-foreground">{r.assetTag}</TD>
                  <TD className="text-right tabular-nums">{r.loans}</TD>
                  <TD className="text-right tabular-nums">{r.daysOut}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Staff insights: which equipment is used (and which is not), and who returns late. */
export default function Insights() {
  const api = useApi();
  const [usageDays, setUsageDays] = useState(90);
  const [lateDays, setLateDays] = useState(180);

  const q = useQuery({
    queryKey: ['lab', 'insights', usageDays, lateDays],
    queryFn: () => api.get('/insights', { params: { usageDays, lateDays } }).then((r) => r.data),
  });

  const pdf = useMutation({
    mutationFn: () => api.post('/insights/report', { usageDays, lateDays }).then((r) => r.data.report),
    onSuccess: async (report) => {
      toast.success(`${report.title} is ready`);
      try { await downloadReport(api, report); } catch (err) { toast.error(errorMessage(err)); }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const u = q.data?.utilization;
  const l = q.data?.late;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Insights"
        description="Which instruments earn their bench space, and who keeps them too long."
        icon={<ChartColumn className="h-6 w-6 text-primary" />}
        actions={
          <Button onClick={() => pdf.mutate()} disabled={pdf.isPending || q.isLoading}>
            <FileDown className="h-4 w-4" aria-hidden /> {pdf.isPending ? 'Conjuring PDF…' : 'Download PDF'}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="usage-days" className="text-xs text-muted-foreground">Equipment use over</Label>
          <Select id="usage-days" value={usageDays} onChange={(e) => setUsageDays(Number(e.target.value))}>
            {USAGE.map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="late-days" className="text-xs text-muted-foreground">Late returns over</Label>
          <Select id="late-days" value={lateDays} onChange={(e) => setLateDays(Number(e.target.value))}>
            {LATE.map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </Select>
        </div>
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-4">{[0, 1].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : q.isError ? (
        <Card><p role="alert" className="p-5 text-sm text-destructive">{errorMessage(q.error)}</p></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Stat label="Loans started" value={u.totalLoans} />
            <Stat label="Never borrowed" value={u.neverBorrowed} />
            <Stat label="Borrowers with late returns" value={l.borrowers.length} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <UsageTable title="Most used" rows={u.mostUsed} empty="No loans in this period." />
            <UsageTable title="Least used" rows={u.leastUsed} empty="No equipment yet." />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Late returns</CardTitle>
              <CardDescription>Loans that came back after the due date, or are overdue now.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 md:px-0">
              {l.borrowers.length === 0 ? (
                <EmptyCrypt title="Everyone returns on time">Nobody has a late loan in this period.</EmptyCrypt>
              ) : (
                <Table>
                  <THead><TR className="hover:bg-transparent"><TH>Borrower</TH><TH className="text-right">Late</TH><TH className="text-right">Late %</TH><TH className="text-right">Still out</TH><TH className="text-right">Loans</TH></TR></THead>
                  <TBody>
                    {l.borrowers.map((b) => (
                      <TR key={b.borrowerId}>
                        <TD className="font-medium">{b.name}</TD>
                        <TD className="text-right tabular-nums">{b.late}</TD>
                        <TD className="text-right tabular-nums">{b.lateRate}%</TD>
                        <TD className="text-right tabular-nums">{b.stillOut}</TD>
                        <TD className="text-right tabular-nums">{b.loans}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
