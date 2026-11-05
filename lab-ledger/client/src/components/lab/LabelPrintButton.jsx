import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Printer } from 'lucide-react';
import { Button } from '../ui/button';
import { useApi } from '../../hooks/useApi';
import { printLabels } from '../../api/lab';
import { errorMessage } from '../../lib/utils';
import { MAX_LABELS } from '../../lib/lab';

/**
 * Downloads the A4 QR label sheet (3 × 8 per page) for the selected equipment (lab-ledger Req 5.1).
 * Render it only for staff — the server refuses everyone else.
 */
export function LabelPrintButton({ ids }) {
  const api = useApi();
  const print = useMutation({
    mutationFn: () => printLabels(api, ids),
    onSuccess: (n) => toast.success(`${n} label${n === 1 ? '' : 's'} ready to print`),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const tooMany = ids.length > MAX_LABELS;
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button onClick={() => print.mutate()} disabled={!ids.length || tooMany || print.isPending}>
        <Printer className="h-4 w-4" aria-hidden /> {print.isPending ? 'Printing…' : `Print ${ids.length || ''} label${ids.length === 1 ? '' : 's'}`.replace('  ', ' ')}
      </Button>
      {tooMany && <p role="alert" className="text-xs text-destructive">At most {MAX_LABELS} labels per run — deselect {ids.length - MAX_LABELS}.</p>}
    </div>
  );
}
