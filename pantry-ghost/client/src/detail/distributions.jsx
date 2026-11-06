import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Table, THead, TBody, TR, TH, TD, Badge } from '../components/ui/display';
import { amount } from '../lib/pantry';
import { formatDate } from '../lib/format';

const LOCATION_ORDER = { Fridge: 0, Freezer: 1, Shelf: 2 };

/**
 * Detail panel for one distribution (skeleton Req 16.13): the lines packed for the household,
 * grouped by storage location the way volunteers pick them. `lines` is a sub-document array added
 * through extendSchema, so the generic field list cannot show it.
 */
export default function DistributionLines({ record }) {
  const lines = [...(record.lines ?? [])].sort(
    (a, b) => (LOCATION_ORDER[a.location] ?? 9) - (LOCATION_ORDER[b.location] ?? 9) || String(a.itemName).localeCompare(b.itemName)
  );
  const total = lines.reduce((n, l) => n + (l.quantity ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Packed lines</CardTitle>
        <CardDescription>
          {lines.length} line{lines.length === 1 ? '' : 's'} · {total} units, oldest stock first
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 md:px-0">
        {lines.length === 0 ? (
          <p className="px-5 text-sm text-muted-foreground">No lines were recorded for this distribution.</p>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Item</TH>
                <TH>Amount</TH>
                <TH className="hidden sm:table-cell">Category</TH>
                <TH>Location</TH>
                <TH className="hidden sm:table-cell">Expires</TH>
              </TR>
            </THead>
            <TBody>
              {lines.map((l, i) => (
                <TR key={`${l.lot}-${i}`}>
                  <TD className="font-medium">
                    {l.lot ? (
                      <Link to={`/r/stock-lots/${l.lot}`} className="hover:text-primary hover:underline">{l.itemName}</Link>
                    ) : (
                      l.itemName
                    )}
                  </TD>
                  <TD className="tabular-nums">{amount(l.quantity, l.unit)}</TD>
                  <TD className="hidden text-muted-foreground sm:table-cell">{l.category}</TD>
                  <TD>{l.location ? <Badge variant="muted">{l.location}</Badge> : '—'}</TD>
                  <TD className="hidden text-muted-foreground sm:table-cell">{l.expiresOn ? formatDate(l.expiresOn) : 'No expiry'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
