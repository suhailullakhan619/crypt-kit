import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, House, Users, Trash2 } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';

function Tile({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden /> {label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * "This month" dashboard panel: units in/out, households served, people reached, waste rate.
 * Aggregates only (safe for Board). Server: server/src/dashboard/thisMonth.js.
 */
export default function ThisMonthPanel({ data }) {
  const { role, isSuperuser } = usePermission();
  if (!data) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile icon={ArrowDownToLine} label="Units in" value={data.unitsIn} />
        <Tile icon={ArrowUpFromLine} label="Units out" value={data.unitsOut} hint={`${data.distributions} boxes`} />
        <Tile icon={House} label="Households" value={data.households} />
        <Tile icon={Users} label="People reached" value={data.people} />
        <Tile icon={Trash2} label="Waste rate" value={`${(data.wasteRate * 100).toFixed(1)}%`} hint={`${data.wasteUnits} units`} />
      </div>
      <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{data.month}</span>
        {(isSuperuser || role === 'Board') && <Link to="/impact" className="font-medium text-primary hover:underline">Open the impact report →</Link>}
      </p>
    </div>
  );
}
