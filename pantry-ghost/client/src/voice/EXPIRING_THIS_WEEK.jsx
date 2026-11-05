import { Link } from 'react-router-dom';
import { amount, expiresIn } from '../lib/pantry';

/** Voice result renderer for EXPIRING_THIS_WEEK: the spoken top 5 as a tappable list. */
export default function ExpiringThisWeek({ result }) {
  const lots = result?.data?.lots ?? [];
  if (!lots.length) return null;
  return (
    <ul className="flex flex-col divide-y rounded-lg border" aria-label="Lots expiring this week">
      {lots.map((l) => (
        <li key={l._id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <Link to={`/r/stock-lots/${l._id}`} className="min-w-0 truncate font-medium hover:text-primary">{amount(l.quantity, l.unit)} · {l.itemName}</Link>
          <span className="shrink-0 text-xs text-muted-foreground">{l.location} · {expiresIn(l.expiresOn)}</span>
        </li>
      ))}
    </ul>
  );
}
