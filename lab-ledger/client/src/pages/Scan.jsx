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
import { QrReader } from '../components/scan/QrReader';
import { tagFromScan } from '../lib/lab';

const BUBBLES = [
  { left: '18%', delay: '0s', size: 'h-3 w-3' },
  { left: '34%', delay: '0.8s', size: 'h-2 w-2' },
  { left: '58%', delay: '0.4s', size: 'h-4 w-4' },
  { left: '76%', delay: '1.3s', size: 'h-2.5 w-2.5' },
];
/** The green "bubbling beaker" over the camera view (decorative; frozen under prefers-reduced-motion). */
function BeakerOverlay() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 animate-scanline bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-primary/35 to-transparent">
        {BUBBLES.map((b) => (
          <span key={b.left} className={`absolute bottom-2 rounded-full bg-primary/80 ${b.size} animate-bubble`} style={{ left: b.left, animationDelay: b.delay }} />
        ))}
      </div>
    </>
  );
}

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
        <Label htmlFor="asset-tag">Asset tag or link</Label>
        <Input id="asset-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="LL-0042" autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono" />
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
 * phone camera app lands directly on the result. Inside the app: the live camera (decoded in every
 * browser), a photo or screenshot of a label, or typing / pasting the tag or link.
 */
export default function Scan() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const openScan = (text) => { const t = tagFromScan(text); if (t) navigate(`/scan/${encodeURIComponent(t)}`); };

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
      <PageHeader title="Scan a label" description="Scan the QR label on the equipment, or type the asset tag printed under it." icon={<ScanLine className="h-6 w-6 text-primary" />} />
      <Card>
        <CardHeader>
          <CardTitle>Scan a QR label</CardTitle>
          <CardDescription>Use the camera, or pick a photo or screenshot of the label. Works in every browser.</CardDescription>
        </CardHeader>
        <CardContent><QrReader onResult={openScan} overlay={<BeakerOverlay />} hint="Point the camera at an equipment label." /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Or type the tag</CardTitle>
          <CardDescription>The asset tag is printed under every QR code, for example <span className="font-mono">LL-0001</span>. You can also paste a label link.</CardDescription>
        </CardHeader>
        <CardContent><TagForm /></CardContent>
      </Card>
    </div>
  );
}
