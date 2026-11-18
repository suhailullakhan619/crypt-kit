import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChartColumn, FileDown } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { downloadReport } from '../api/reports';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Skeleton, Table, THead, TBody, TR, TH, TD, Badge } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { EmptyCrypt } from '../components/spooky';
import { errorMessage } from '../lib/utils';

const WINDOWS = [30, 90, 365];

/** Staff insights: which categories need restocking, and which donors' food goes to waste. */
export default function Insights() {
  const api = useApi();
  const [days, setDays] = useState(90);

  const q = useQuery({
    queryKey: ['pantry', 'insights', days],
    queryFn: () => api.get('/insights', { params: { days } }).then((r) => r.data),
  });

  const pdf = useMutation({
    mutationFn: () => api.post('/insights/report', { days }).then((r) => r.data.report),
    onSuccess: async (report) => {
      toast.success(`${report.title} is ready`);
      try { await downloadReport(api, report); } catch (err) { toast.error(errorMessage(err)); }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const lowCount = q.data?.stock.filter((s) => s.low).length ?? 0;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Insights"
        description="What to restock, and where the waste comes from."
        icon={<ChartColumn className="h-6 w-6 text-primary" />}
        actions={
          <Button onClick={() => pdf.mutate()} disabled={pdf.isPending || q.isLoading}>
            <FileDown className="h-4 w-4" aria-hidden /> {pdf.isPending ? 'Conjuring PDF…' : 'Download PDF'}
          </Button>
        }
      />

      <div className="flex flex-col gap-1.5 sm:w-56">
        <Label htmlFor="insight-days" className="text-xs text-muted-foreground">Donor waste over</Label>
        <Select id="insight-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {WINDOWS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </Select>
      </div>

      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : q.isError ? (
        <Card><p role="alert" className="p-5 text-sm text-destructive">{errorMessage(q.error)}</p></Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Stock against minimum</CardTitle>
              <CardDescription>
                {lowCount === 0 ? 'Every category is at or above its minimum.' : `${lowCount} categor${lowCount === 1 ? 'y is' : 'ies are'} running low. Fresh and expiring-soon units only.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 md:px-0">
              <Table>
                <THead><TR className="hover:bg-transparent"><TH>Category</TH><TH>Status</TH><TH className="text-right">On hand</TH><TH className="text-right">Minimum</TH><TH className="text-right">Short by</TH></TR></THead>
                <TBody>
                  {q.data.stock.map((s) => (
                    <TR key={s.category}>
                      <TD className="font-medium">{s.category}</TD>
                      <TD>{s.low ? <Badge variant="destructive">Low</Badge> : <Badge variant="muted">OK</Badge>}</TD>
                      <TD className="text-right tabular-nums">{s.units}</TD>
                      <TD className="text-right tabular-nums">{s.min}</TD>
                      <TD className="text-right tabular-nums">{s.short}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Waste by donor</CardTitle>
              <CardDescription>Units still on lots that expired or were discarded, out of what each donor gave.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 md:px-0">
              {q.data.waste.donors.length === 0 ? (
                <EmptyCrypt title="No donations in this period">Donations with a named donor show up here.</EmptyCrypt>
              ) : (
                <Table>
                  <THead><TR className="hover:bg-transparent"><TH>Donor</TH><TH className="text-right">Waste %</TH><TH className="text-right">Wasted</TH><TH className="text-right">Received</TH><TH className="text-right">Lots</TH></TR></THead>
                  <TBody>
                    {q.data.waste.donors.map((d) => (
                      <TR key={d.donorId}>
                        <TD className="font-medium">{d.name}</TD>
                        <TD className="text-right tabular-nums">{d.wasteRate}%</TD>
                        <TD className="text-right tabular-nums">{d.wasted}</TD>
                        <TD className="text-right tabular-nums">{d.received}</TD>
                        <TD className="text-right tabular-nums">{d.lots}</TD>
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
