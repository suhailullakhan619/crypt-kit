import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileDown } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { downloadReport } from '../api/reports';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { errorMessage } from '../lib/utils';

const iso = (d) => d.toISOString().slice(0, 10);
const startOfYear = () => iso(new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)));

/** Detail panel for a donor: preview what they gave in a period and download a thank-you receipt PDF. */
export default function DonorReceipt({ record }) {
  const api = useApi();
  const qc = useQueryClient();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(iso(new Date()));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;

  const preview = useQuery({
    queryKey: ['donor-receipt', record._id, from, to],
    queryFn: () => api.get(`/donors/${record._id}/receipt/preview`, { params: { from, to } }).then((r) => r.data.receipt),
    enabled: valid,
  });

  const generate = useMutation({
    mutationFn: () => api.post(`/donors/${record._id}/receipt`, { from, to }).then((r) => r.data.report),
    onSuccess: async (report) => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      toast.success(`${report.title} is ready`);
      try { await downloadReport(api, report); } catch (err) { toast.error(errorMessage(err)); }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const r = preview.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Donation receipt</CardTitle>
        <CardDescription>Thank {record.name} with a PDF listing everything they gave in a period.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); generate.mutate(); }}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-from" className="text-xs text-muted-foreground">From</Label>
            <Input id="receipt-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt-to" className="text-xs text-muted-foreground">To</Label>
            <Input id="receipt-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
          </div>
          <Button type="submit" disabled={!valid || generate.isPending || !r?.rows.length}>
            <FileDown className="h-4 w-4" aria-hidden /> {generate.isPending ? 'Conjuring PDF…' : 'Download receipt'}
          </Button>
        </form>
        {!valid && <p role="alert" className="text-sm text-destructive">Pick a start date that is not after the end date.</p>}
        {valid && preview.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(preview.error)}</p>}
        {valid && r && (
          <p role="status" className="text-sm text-muted-foreground">
            {r.rows.length === 0
              ? 'Nothing was received from this donor in that period.'
              : `${r.rows.length} donation${r.rows.length === 1 ? '' : 's'}, ${r.totalUnits} units in total.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
