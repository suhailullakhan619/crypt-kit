import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/display';
import { humanise } from '../lib/utils';

/** Rich answer for WHO_HAS / IS_AVAILABLE: matching items as links to their scan cards. */
export default function WhoHas({ result }) {
  const matches = result?.data?.matches ?? [];
  if (!matches.length) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Matching equipment">
      {matches.slice(0, 5).map((m) => (
        <li key={m._id}>
          <Link to={`/scan/${m.assetTag}`} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm hover:border-primary/60">
            <span className="font-mono text-xs text-muted-foreground">{m.assetTag}</span>
            <span className="font-medium">{m.name}</span>
            <Badge variant={m.status === 'Available' ? 'success' : 'warning'} className="ml-auto">{humanise(m.status)}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
