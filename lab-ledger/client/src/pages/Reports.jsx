import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, FileText, Sparkles } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useMeta } from '../context/MetaContext';
import { listReports, generateReport, downloadReport } from '../api/reports';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Skeleton, Table, THead, TBody, TR, TH, TD, Badge } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { ResourceFilters } from '../components/resource/ResourceFilters';
import { EmptyCrypt } from '../components/spooky';
import { formatDateTime } from '../lib/format';
import { errorMessage } from '../lib/utils';
import { reportPresets } from '../appRoutes';

/** Generate, list and download PDF reports (Req 10). Any role that can read a resource may report on it. */
export default function Reports() {
  const api = useApi();
  const meta = useMeta();
  const qc = useQueryClient();
  const [resourceKey, setResourceKey] = useState('');
  const [title, setTitle] = useState('');
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const key = resourceKey || meta.resources[0]?.key || '';
  const resource = meta.resource(key);

  const reports = useQuery({ queryKey: ['reports', page], queryFn: () => listReports(api, { page }) });

  const generate = useMutation({
    mutationFn: (body) => generateReport(api, body),
    onSuccess: async (report) => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      toast.success(`Report ready — ${report.count} records`);
      try { await downloadReport(api, report); } catch (err) { toast.error(errorMessage(err)); }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submit = (e) => {
    e.preventDefault();
    generate.mutate({ resource: key, title: title || undefined, filters });
  };

  const labelFor = (k) => meta.resource(k)?.label ?? k;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Print-ready PDF reports for audits, inspections and funders." icon={<FileText className="h-6 w-6 text-primary" />} />

      <Card>
        <CardHeader>
          <CardTitle>Generate a report</CardTitle>
          <CardDescription>Pick what to include. The PDF downloads as soon as it is ready.</CardDescription>
        </CardHeader>
        <CardContent>
          {reportPresets.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {reportPresets.map((p) => (
                <Button key={p.label} variant="secondary" size="sm" disabled={generate.isPending}
                  onClick={() => generate.mutate({ resource: p.resource, filters: p.filters, title: p.title ?? p.label })}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> {p.label}
                </Button>
              ))}
            </div>
          )}
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5 sm:max-w-[13rem]">
              <Label htmlFor="report-resource" className="text-xs text-muted-foreground">Records</Label>
              <Select id="report-resource" value={key} onChange={(e) => { setResourceKey(e.target.value); setFilters({}); }}>
                {meta.resources.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </Select>
            </div>
            <div className="flex min-w-[12rem] flex-[2] flex-col gap-1.5">
              <Label htmlFor="report-title" className="text-xs text-muted-foreground">Title (optional)</Label>
              <Input id="report-title" value={title} maxLength={120} placeholder={resource ? `${resource.label} report` : ''} onChange={(e) => setTitle(e.target.value)} />
            </div>
            {resource && <ResourceFilters resource={resource} values={filters} onChange={setFilters} idPrefix="report-filter" />}
            <Button type="submit" disabled={!key} loading={generate.isPending}>{generate.isPending ? 'Conjuring PDF…' : 'Generate PDF'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Previous reports</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2 md:px-0">
          {reports.isLoading ? (
            <div className="flex flex-col gap-3 px-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : !reports.data?.items.length ? (
            <EmptyCrypt title="No reports yet">Generate your first one above.</EmptyCrypt>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Title</TH><TH>Records</TH><TH className="hidden sm:table-cell">Generated</TH><TH className="hidden md:table-cell">By</TH><TH><span className="sr-only">Download</span></TH>
                </TR>
              </THead>
              <TBody>
                {reports.data.items.map((r) => (
                  <TR key={r._id}>
                    <TD className="font-medium">
                      {r.title}
                      <div className="mt-0.5 text-xs font-normal text-muted-foreground sm:hidden">{formatDateTime(r.generatedAt)}</div>
                    </TD>
                    <TD><Badge variant="muted">{labelFor(r.resource)} · {r.count}</Badge></TD>
                    <TD className="hidden text-muted-foreground sm:table-cell">{formatDateTime(r.generatedAt)}</TD>
                    <TD className="hidden text-muted-foreground md:table-cell">{r.generatedBy?.name ?? '—'}</TD>
                    <TD className="text-right">
                      <Button variant="ghost" size="icon" aria-label={`Download ${r.title}`}
                        onClick={() => downloadReport(api, r).catch((err) => toast.error(errorMessage(err)))}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {reports.data?.pages > 1 && (
            <div className="flex justify-end gap-2 px-5 pt-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= reports.data.pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
