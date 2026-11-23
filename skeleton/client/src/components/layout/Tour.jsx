import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useMeta } from '../../context/MetaContext';
import { examples as fetchExamples } from '../../api/voice';
import qrCodes from '../../qrCodes';
import { buildSteps } from '../../lib/tour';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

/**
 * First-run tour: a few dialog steps that point out search, the assistant, scanning and the theme.
 * Closing it in any way (Done, Skip, Escape, the close button) counts as finished: `onFinish` is called.
 * Arrow keys move between steps.
 *
 * @param {{ open: boolean, onFinish: () => void }} props
 */
export function Tour({ open, onFinish }) {
  const api = useApi();
  const meta = useMeta();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const { data } = useQuery({ queryKey: ['voice', 'examples'], queryFn: () => fetchExamples(api), enabled: open, staleTime: 60_000 });
  const steps = useMemo(
    () => buildSteps({ appName: meta.appName ?? 'this app', hasQr: Object.keys(qrCodes).length > 0, example: data?.examples?.find((e) => e !== 'help') }),
    [meta.appName, data]
  );
  useEffect(() => { if (open) setIndex(0); }, [open]);

  const last = index === steps.length - 1;
  const step = steps[Math.min(index, steps.length - 1)];
  const next = () => (last ? onFinish() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));
  const onKeyDown = (e) => {
    if (e.target?.tagName === 'BUTTON' && e.key === 'Enter') return; // let a focused button do its own thing
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onFinish(); }}>
      <DialogContent className="max-w-md" onKeyDown={onKeyDown}>
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground" aria-label={`Step ${index + 1} of ${steps.length}`}>
            Step {index + 1} of {steps.length}
          </p>
          <div className="flex flex-col gap-2">
            <DialogTitle className="font-display text-xl">{step.title}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-foreground/80">{step.body}</DialogDescription>
          </div>
          {step.action && (
            <Button variant="secondary" className="w-fit" onClick={() => { const to = step.action.to; onFinish(); navigate(to); }}>
              {step.action.label} <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex gap-1.5" aria-hidden>
              {steps.map((s, i) => <span key={s.id} className={cn('h-1.5 w-5 rounded-full transition-colors', i === index ? 'bg-primary' : i < index ? 'bg-primary/40' : 'bg-muted')} />)}
            </div>
            <div className="flex gap-2">
              {index === 0 ? (
                <Button variant="ghost" onClick={onFinish}>Skip</Button>
              ) : (
                <Button variant="ghost" onClick={back}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Button>
              )}
              <Button onClick={next}>{last ? 'Done' : 'Next'}{!last && <ArrowRight className="h-4 w-4" aria-hidden />}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
