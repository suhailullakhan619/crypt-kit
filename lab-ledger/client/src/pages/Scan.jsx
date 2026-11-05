import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ScanLine, Search, ArrowLeft } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { equipmentByTag } from '../api/lab';
import { PageHeader } from '../components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Skeleton } from '../components/ui/display';
import { Button, buttonVariants } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { EmptyCrypt } from '../components/spooky';
import { EquipmentCard } from '../components/lab/EquipmentCard';
import { QrScanner, canScan } from '../components/lab/QrScanner';
import { tagFromScan } from '../lib/lab';

function TagForm({ initial = '' }) {
  const navigate = useNavigate();
  const [tag, setTag] = useState(initial);
  const submit = (e) => {
    e.preventDefault();
    const t = tagFromScan(tag);
    if (t) navigate(`/scan/${encodeURIComponent(t)}`);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="asset-tag">Asset tag</Label>
        <Input id="asset-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="LL-0042" autoComplete="off" autoCapitalize="characters" className="font-mono uppercase" />
      </div>
      <Button type="submit" disabled={!tag.trim()}><Search className="h-4 w-4" aria-hidden /> Look up</Button>
    </form>
  );
}

function ScanResult({ tag }) {
  const api = useApi();
  const q = useQuery({ queryKey: ['lab', 'tag', tag], queryFn: () => equipmentByTag(api, tag), retry: false });

  if (q.isLoading) {
    return <Card className="p-5"><Skeleton className="h-6 w-40" /><Skeleton className="mt-4 h-8 w-64" /><Skeleton className="mt-6 h-24 w-full" /></Card>;
  }
  if (q.isError) {
    const notFound = q.error?.response?.status === 404;
    return (
      <Card>
        <EmptyCrypt
          title={notFound ? 'No equipment haunts this tag' : 'The lookup fizzled'}
          action={<Link to={`/r/equipment?q=${encodeURIComponent(tag)}`} className={buttonVariants({ variant: 'secondary' })}><Search className="h-4 w-4" aria-hidden /> Search equipment</Link>}
        >
          {notFound ? <>Nothing is labelled <span className="font-mono">{tag}</span>. Check the label, or search by name.</> : 'Please try again in a moment.'}
        </EmptyCrypt>
      </Card>
    );
  }
  return <EquipmentCard data={q.data} />;
}

/**
 * /scan and /scan/:tag (lab-ledger Req 5.2–5.4). QR labels encode <CLIENT_URL>/scan/<assetTag>, so a
 * phone camera app lands directly on the result; inside the app the BarcodeDetector camera scanner is
 * offered when available, with manual entry as the fallback.
 */
export default function Scan() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const scanner = canScan();

  if (tag) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Link to="/scan" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Scan another label
        </Link>
        <ScanResult tag={tag.toUpperCase()} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title="Scan a label" description="Point your camera at a QR label, or type the asset tag." icon={<ScanLine className="h-6 w-6 text-primary" />} />
      {scanner && (
        <Card>
          <CardHeader><CardTitle>Camera</CardTitle><CardDescription>Reads Lab Ledger QR labels.</CardDescription></CardHeader>
          <CardContent><QrScanner onTag={(t) => navigate(`/scan/${encodeURIComponent(t)}`)} /></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{scanner ? 'Or type the tag' : 'Type the tag'}</CardTitle>
          {!scanner && <CardDescription>This browser can’t read QR codes itself — your phone’s camera app can open the label link directly.</CardDescription>}
        </CardHeader>
        <CardContent><TagForm /></CardContent>
      </Card>
    </div>
  );
}
