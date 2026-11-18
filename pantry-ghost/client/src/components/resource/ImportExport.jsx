import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '../../hooks/useApi';
import { Button } from '../ui/button';
import { Label } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { errorMessage } from '../../lib/utils';

const readText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

/** Downloads the CSV for the current filters, sending the auth header (a plain link could not). */
export async function downloadCsv(api, key, params = {}) {
  const res = await api.get(`/r/${key}/export`, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${key}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Export button: respects the list's active search and filters. */
export function ExportButton({ resourceKey, params }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await downloadCsv(api, resourceKey, params);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      <Download className="h-4 w-4" aria-hidden /> {busy ? 'Exporting…' : 'Export CSV'}
    </Button>
  );
}

/**
 * Import flow: choose a file, check it (server dry run, nothing is written), then confirm.
 * The import button only appears after a clean-enough check, and the server again validates every row.
 */
export function ImportButton({ resource }) {
  const api = useApi();
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setCsv(''); setFileName(''); setReport(null); setBusy(false); if (fileRef.current) fileRef.current.value = ''; };
  const onOpenChange = (v) => { setOpen(v); if (!v) reset(); };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 900 * 1024) { toast.error('That file is too large (limit 900 KB).'); return; }
    setFileName(file.name);
    setCsv(await readText(file));
    setReport(null);
  };

  const send = async (dryRun) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/r/${resource.key}/import`, { csv, dryRun });
      setReport(data);
      if (!dryRun) {
        qc.invalidateQueries({ queryKey: ['r', resource.key] });
        toast.success(`Imported ${data.created} of ${data.total} rows`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const imported = report && !report.dryRun;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Upload className="h-4 w-4" aria-hidden /> Import CSV</Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import {resource.label}</DialogTitle>
            <DialogDescription>
              Use the same columns as the CSV export. Rows are checked first and nothing is saved until you confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-file">CSV file</Label>
            <input
              id="import-file"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
            />
            {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
          </div>

          {report && (
            <div role="status" className="grid gap-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                {report.errors.length === 0
                  ? <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                  : <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />}
                {imported
                  ? `Imported ${report.created} of ${report.total} rows.`
                  : `${report.valid} of ${report.total} rows are ready to import.`}
              </p>
              {report.ignoredColumns.length > 0 && (
                <p className="text-muted-foreground">Ignored columns: {report.ignoredColumns.join(', ')}</p>
              )}
              {report.errors.length > 0 && (
                <ul className="max-h-48 overflow-y-auto rounded-md border p-2" aria-label="Rows with problems">
                  {report.errors.map((e) => (
                    <li key={`${e.row}-${e.message}`} className="py-0.5"><strong>Row {e.row}:</strong> {e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{imported ? 'Close' : 'Cancel'}</Button>
            {!imported && <Button variant="secondary" disabled={!csv || busy} onClick={() => send(true)}>{busy ? 'Working…' : 'Check file'}</Button>}
            {report?.dryRun && report.valid > 0 && (
              <Button disabled={busy} onClick={() => send(false)}>Import {report.valid} row{report.valid === 1 ? '' : 's'}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
