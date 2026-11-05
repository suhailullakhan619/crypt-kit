import { Badge } from '../ui/display';
import { humanise } from '../../lib/utils';

const RULES = [
  [/(overdue|expired|fail|damaged|lost|rejected|late|broken)/i, 'destructive'],
  [/(due|soon|maintenance|requested|pending|review|progress|fair)/i, 'warning'],
  [/(done|complete|available|fresh|active|returned|pass|good|open|approved|ok)/i, 'success'],
  [/(archived|retired|cancelled|discarded|depleted|disposed|inactive|closed)/i, 'muted'],
];

/**
 * Colour-codes a status value. Uses the resource's due/softDelete rules first, then keywords.
 * @param {{ value: string, resource?: object }} props
 */
export function StatusBadge({ value, resource }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  let variant = 'accent';
  if (resource?.due?.to === value) variant = 'destructive';
  else if (resource?.softDelete?.value === value) variant = 'muted';
  else variant = RULES.find(([re]) => re.test(value))?.[1] ?? 'accent';
  return <Badge variant={variant}>{humanise(value)}</Badge>;
}
