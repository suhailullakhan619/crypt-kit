import { Badge } from '../ui/display';
import { humanise } from '../../lib/utils';

const RULES = [
  [/(overdue|expired|fail|damaged|lost|rejected|late|broken)/i, 'destructive'],
  [/(due|soon|maintenance|requested|pending|review|progress|fair)/i, 'warning'],
  [/(done|complete|available|fresh|active|returned|pass|good|open|approved|ok)/i, 'success'],
  [/(archived|retired|cancelled|discarded|depleted|disposed|inactive|closed)/i, 'muted'],
];

/**
 * Badge variant for a status value: the resource's due/softDelete rules first, then keywords.
 * Shared by the badge and by charts so a status has the same colour everywhere.
 * @returns {'destructive'|'warning'|'success'|'muted'|'accent'}
 */
export function statusVariant(value, resource) {
  if (resource?.due?.to === value) return 'destructive';
  if (resource?.softDelete?.value === value) return 'muted';
  return RULES.find(([re]) => re.test(value))?.[1] ?? 'accent';
}

/**
 * Colour-codes a status value.
 * @param {{ value: string, resource?: object }} props
 */
export function StatusBadge({ value, resource }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={statusVariant(value, resource)}>{humanise(value)}</Badge>;
}
