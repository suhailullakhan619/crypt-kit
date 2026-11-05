import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from '../ui/display';
import { StatusBadge } from './StatusBadge';
import { displayValue } from '../../lib/format';

/** Fields shown as columns: `list: true` (falls back to the first four fields). */
export function listColumns(resource) {
  const cols = resource.fields.filter((f) => f.list);
  return cols.length ? cols : resource.fields.slice(0, 4);
}

function statusField(resource) {
  return resource.statusFlow?.field ?? resource.due?.status ?? resource.softDelete?.field ?? null;
}

/**
 * Records table (Req 13.3). The title column links to the detail page; on small screens
 * columns beyond the first two collapse into a stacked card layout.
 */
export function ResourceTable({ resource, items }) {
  const cols = listColumns(resource);
  const sField = statusField(resource);
  const title = resource.titleField ?? cols[0]?.name;

  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden md:block">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              {cols.map((c) => <TH key={c.name}>{c.label}</TH>)}
              <TH className="w-8"><span className="sr-only">Open</span></TH>
            </TR>
          </THead>
          <TBody>
            {items.map((item) => (
              <TR key={item._id}>
                {cols.map((c) => (
                  <TD key={c.name} className={c.name === title ? 'font-medium' : 'text-muted-foreground'}>
                    {c.name === title ? (
                      <Link to={`/r/${resource.key}/${item._id}`} className="text-foreground hover:text-primary hover:underline">
                        {displayValue(c, item[c.name])}
                      </Link>
                    ) : c.name === sField ? (
                      <StatusBadge value={item[c.name]} resource={resource} />
                    ) : (
                      displayValue(c, item[c.name])
                    )}
                  </TD>
                ))}
                <TD>
                  <Link to={`/r/${resource.key}/${item._id}`} aria-label={`Open ${displayValue({}, item[title])}`} className="text-muted-foreground hover:text-primary">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col divide-y md:hidden">
        {items.map((item) => (
          <li key={item._id}>
            <Link to={`/r/${resource.key}/${item._id}`} className="flex items-start gap-3 px-1 py-3 hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{displayValue({}, item[title])}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {cols.filter((c) => c.name !== title && c.name !== sField).slice(0, 3).map((c) => (
                    <span key={c.name}>{c.label}: {displayValue(c, item[c.name])}</span>
                  ))}
                </p>
              </div>
              {sField && <StatusBadge value={item[sField]} resource={resource} />}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
