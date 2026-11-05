import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/display';
import { formatDate } from '../lib/format';

/** Rich answer for CALIBRATION_DUE: the items to calibrate, overdue ones flagged. */
export default function CalibrationDue({ result }) {
  const items = result?.data?.items ?? [];
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Equipment needing calibration">
      {items.map((i) => (
        <li key={i._id}>
          <Link to={`/scan/${i.assetTag}`} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm hover:border-primary/60">
            <span className="font-mono text-xs text-muted-foreground">{i.assetTag}</span>
            <span className="font-medium">{i.name}</span>
            <span className="ml-auto text-muted-foreground">{formatDate(i.nextCalibration)}</span>
            {i.late && <Badge variant="destructive">Overdue</Badge>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
