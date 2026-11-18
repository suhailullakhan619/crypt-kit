import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Download, Printer, QrCode } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Skeleton } from '../ui/display';
import { Button } from '../ui/button';

/** Absolute URL for an app path, so the QR works when scanned with any phone camera. */
export const absoluteUrl = (pathOrUrl) => (/^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${window.location.origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`);

const fileName = (s) => String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'qr-code';

/**
 * QR code for a record, shown on its detail page. Scanning it opens `path` in this portal.
 * Black on white with a quiet zone, so it scans reliably whatever the portal theme.
 *
 * @param {{ path: string, title: string, caption?: string, appName?: string }} props
 */
export function RecordQrCard({ path, title, caption, appName }) {
  const url = absoluteUrl(path);
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setSvg(null);
    import('qrcode')
      .then((QR) => QR.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#111827', light: '#ffffff' } }))
      .then((s) => { if (alive) setSvg(s); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [url]);

  const downloadPng = async () => {
    try {
      const QR = await import('qrcode');
      const dataUrl = await QR.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 600, color: { dark: '#111827', light: '#ffffff' } });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileName(caption ?? title)}-qr.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(`Could not create the image: ${e.message}`);
    }
  };

  const printLabel = () => {
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) { toast.error('Allow pop-ups to print the label'); return; }
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    w.document.write(`<!doctype html><title>${esc(title)}</title>
<style>body{font-family:Arial,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh}
.l{border:1px dashed #9ca3af;padding:18px 22px;text-align:center;width:300px}
.l svg{width:220px;height:220px}.a{font-size:11px;letter-spacing:.08em;color:#4b5563;text-transform:uppercase}
.t{font-size:18px;font-weight:700;margin:6px 0 2px}.c{font-family:monospace;font-size:15px}.u{font-size:9px;color:#6b7280;word-break:break-all;margin-top:8px}
@media print{.l{border:0}}</style>
<div class="l"><div class="a">${esc(appName)}</div>${svg}<div class="t">${esc(title)}</div>${caption ? `<div class="c">${esc(caption)}</div>` : ''}<div class="u">${esc(url)}</div></div>
<script>window.onload=()=>{window.print()}</script>`);
    w.document.close();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><QrCode className="h-4 w-4 text-primary" aria-hidden /> QR code</CardTitle>
        <CardDescription>Scan with a phone camera to open this {caption ? 'item' : 'record'}.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        {error ? (
          <p role="alert" className="text-sm text-destructive">Could not draw the QR code: {error}</p>
        ) : svg ? (
          <div
            role="img"
            aria-label={`QR code for ${title}`}
            data-qr-value={url}
            className="w-44 rounded-md bg-white p-1 [&>svg]:h-auto [&>svg]:w-full"
            // The SVG comes from the qrcode library (no user input is placed in markup).
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <Skeleton className="h-44 w-44" />
        )}
        {caption && <p className="font-mono text-sm">{caption}</p>}
        <p className="max-w-full break-all text-center text-xs text-muted-foreground">{url}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="secondary" onClick={downloadPng} disabled={!svg}><Download className="h-4 w-4" aria-hidden /> Download</Button>
          <Button size="sm" variant="secondary" onClick={printLabel} disabled={!svg}><Printer className="h-4 w-4" aria-hidden /> Print label</Button>
          <Button size="sm" variant="ghost" onClick={copyLink}><Copy className="h-4 w-4" aria-hidden /> Copy link</Button>
        </div>
      </CardContent>
    </Card>
  );
}
