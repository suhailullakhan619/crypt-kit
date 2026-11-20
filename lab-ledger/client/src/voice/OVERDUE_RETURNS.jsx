import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/display';

/** Rich answer for OVERDUE_RETURNS: the overdue items as links to their scan cards (staff only; students get a count). */
export default function OverdueReturns({ result }) {
  const { detailed, items = [] } = result?.data ?? {};
  if (!detailed || !items.length) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Overdue items">
      {items.map((i) => (
        <li key={`${i.assetTag}-${i.borrower}`}>
          <Link to={`/scan/${i.assetTag}`} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm hover:border-primary/60">
            <span className="font-mono text-xs text-muted-foreground">{i.assetTag}</span>
            <span className="font-medium">{i.name}</span>
            <span className="text-xs text-muted-foreground">with {i.borrower}</span>
            <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">due {i.due}<Badge variant="destructive">Overdue</Badge></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}