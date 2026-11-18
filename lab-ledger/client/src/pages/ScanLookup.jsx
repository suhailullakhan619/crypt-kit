import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScanLine, Search } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useMeta } from '../context/MetaContext';
import { usePermission } from '../hooks/usePermission';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Skeleton } from '../components/ui/display';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { QrReader } from '../components/scan/QrReader';
import { parseScan, findByCode } from '../lib/scan';
import qrCodes from '../qrCodes';

/**
 * "Scan or find": read a QR label (camera or photo), or type / paste an item ID or link, and open the
 * item. `/scan/<id>` (the link inside every QR label) looks the ID up straight away.
 */
export default function ScanLookup() {
  const { code: fromLink } = useParams();
  const api = useApi();
  const meta = useMeta();
  const { can } = usePermission();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [status, setStatus] = useState(null); // { kind: 'busy'|'missing'|'foreign'|'error', text, url? }

  const kinds = Object.entries(qrCodes).filter(([key]) => can(key, 'read'));
  const examples = kinds.map(([, c]) => c.example).filter(Boolean).join(', ');

  const open = useCallback(async (text, { replace = false } = {}) => {
    const parsed = parseScan(text, window.location.origin);
    if (parsed.kind === 'empty') { setStatus({ kind: 'error', text: 'Type an ID, paste a link, or scan a QR code.' }); return; }
    if (parsed.kind === 'path') { navigate(parsed.path, { replace }); return; }
    if (parsed.kind === 'foreign') { setStatus({ kind: 'foreign', text: `This QR code is not for ${meta.appName}. It links to another website, which was not opened.`, url: parsed.url }); return; }
    setStatus({ kind: 'busy', text: `Looking up ${parsed.code}…` });
    try {
      const hit = await findByCode(api, qrCodes, parsed.code, (key) => can(key, 'read'));
      if (hit) { navigate(`/r/${hit.key}/${hit.item._id}`, { replace }); return; }
      setStatus({ kind: 'missing', text: `Nothing in ${meta.appName} has the ID ${parsed.code}.` });
    } catch {
      setStatus({ kind: 'error', text: 'The lookup failed. Check your connection and try again.' });
    }
  }, [api, can, meta.appName, navigate]);

  // Arriving from a QR label (`/scan/SL-0012`): look it up at once, replacing this page in history.
  useEffect(() => {
    if (fromLink && !meta.loading) { setValue(fromLink); open(fromLink, { replace: true }); }
  }, [fromLink, meta.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Permissions decide where to look, so wait for them (a lookup before that would find nothing).
  if (meta.loading) {
    return <div className="mx-auto flex max-w-2xl flex-col gap-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-40 w-full" /><Skeleton className="h-32 w-full" /></div>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader
        title="Scan or find"
        description="Scan a QR label, or type the ID printed under it, to open the item."
        icon={<ScanLine className="h-6 w-6 text-primary" />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Scan a QR code</CardTitle>
          <CardDescription>Use the camera, or pick a photo or screenshot of the label. Works in every browser.</CardDescription>
        </CardHeader>
        <CardContent><QrReader onResult={(t) => { setValue(t); open(t); }} hint="Point the camera at a QR label." /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enter an ID</CardTitle>
          <CardDescription>
            {kinds.length ? <>The ID is printed under each QR code{examples ? <>, for example <span className="font-mono">{examples}</span></> : null}. You can also paste a link.</> : 'Paste a link from a QR code.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); open(value); }}>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="scan-id">ID or link</Label>
              <Input id="scan-id" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kinds[0]?.[1].example ?? 'ID'} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono" />
            </div>
            <Button type="submit" disabled={status?.kind === 'busy'}><Search className="h-4 w-4" aria-hidden /> Find</Button>
          </form>
          {kinds.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {kinds.map(([key, c]) => <li key={key}>{meta.resource(key)?.label ?? key}: <span className="font-mono">{c.example}</span></li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      {status && (
        <Card className={status.kind === 'busy' ? '' : 'border-destructive/40'}>
          <div role={status.kind === 'busy' ? 'status' : 'alert'} className="flex flex-col gap-1 p-4 text-sm">
            <p className={status.kind === 'busy' ? 'text-muted-foreground' : 'font-medium'}>{status.text}</p>
            {status.url && <p className="break-all font-mono text-xs text-muted-foreground">{status.url}</p>}
            {status.kind === 'missing' && <p className="text-muted-foreground">Check the ID for typos. Archived items cannot be opened from a scan.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
