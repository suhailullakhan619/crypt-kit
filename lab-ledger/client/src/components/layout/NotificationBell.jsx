import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '../../hooks/useApi';
import { Button } from '../ui/button';
import { cn, errorMessage } from '../../lib/utils';

const KIND_DOT = { info: 'bg-primary', warning: 'bg-amber-500', danger: 'bg-destructive' };

function ago(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

/** Top-bar bell: unread badge, dropdown of the latest notifications, polls every minute. */
export function NotificationBell() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data),
    refetchInterval: 60000,
  });
  const unread = data?.unread ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.readAt) { await api.post(`/notifications/${n._id}/read`); refresh(); }
    if (n.link) navigate(n.link);
  };
  const readAll = async () => { await api.post('/notifications/read-all'); refresh(); };

  const [emailing, setEmailing] = useState(false);
  const sendTest = async () => {
    setEmailing(true);
    const id = toast.loading('Sending email… It may land in your spam folder, so check there too.', { duration: Infinity });
    try {
      const { data } = await api.post('/notifications/test-email');
      toast.success(`Email sent to ${data.to}. If you don't see it, check your spam folder and mark it "Not spam".`, { id, duration: 10000 });
    } catch (err) {
      toast.error(errorMessage(err), { id, duration: 6000 });
    } finally {
      setEmailing(false);
    }
  };

  return (
    <div className="relative" ref={box}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div role="region" aria-label="Notifications" className="fixed inset-x-4 top-16 z-40 animate-fade-up rounded-lg border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={readAll}><CheckCheck className="h-4 w-4" aria-hidden /> Mark all read</Button>
            )}
          </div>
          {data?.items?.length ? (
            <ul className="max-h-[min(24rem,60dvh)] overflow-y-auto overscroll-contain">
              {data.items.map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn('flex w-full gap-2 border-b px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-accent focus-visible:bg-accent focus-visible:ring-inset focus-visible:ring-offset-0', !n.readAt && 'bg-primary/5')}
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-muted' : KIND_DOT[n.kind] ?? KIND_DOT.info)} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block', !n.readAt && 'font-medium')}>{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                      <span className="block text-xs text-muted-foreground">{ago(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">All quiet. Nothing is haunting you.</p>
          )}
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
            <p className="text-xs text-muted-foreground">Alerts are also emailed. They may land in spam.</p>
            <Button variant="ghost" size="sm" onClick={sendTest} disabled={emailing}><Mail className="h-4 w-4" aria-hidden /> Email me a test</Button>
          </div>
        </div>
      )}
    </div>
  );
}
