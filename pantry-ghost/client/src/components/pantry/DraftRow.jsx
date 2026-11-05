import { Trash2, Ear } from 'lucide-react';
import { Input, Label } from '../ui/input';
import { Select } from '../ui/select';
import { Button } from '../ui/button';
import { Card } from '../ui/display';
import { cn, humanise } from '../../lib/utils';
import { missingFields, MISSING_HINT } from '../../lib/pantry';

/**
 * One editable intake draft (Req 4.6). Fields the ghost didn't catch get an ember outline,
 * `aria-invalid` and a plain hint ("The ghost didn't catch the expiry date").
 *
 * @param {{ row: object, index: number, enums: { category: string[], unit: string[], location: string[] },
 *           donors: Array<{ _id: string, name: string }>, onChange: (patch: object) => void, onRemove: () => void,
 *           serverError?: string }} props
 */
export function DraftRow({ row, index, enums, donors, onChange, onRemove, serverError }) {
  const missing = missingFields(row);
  const id = (f) => `${row.key}-${f}`;
  const flag = (f) => missing.includes(f);
  const ember = 'border-warning ring-2 ring-warning/60';
  const field = (f) => ({
    id: id(f),
    'aria-invalid': flag(f) || undefined,
    'aria-describedby': flag(f) ? id(`${f}-hint`) : undefined,
    className: cn(flag(f) && ember),
  });
  const hint = (f) => flag(f) && <p id={id(`${f}-hint`)} className="text-xs font-medium text-warning">{MISSING_HINT[f]}</p>;

  return (
    <Card className={cn('flex flex-col gap-3 p-4 animate-fade-up', (missing.length > 0 || serverError) && 'border-warning/60')} aria-label={`Draft ${index + 1}`} role="group">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Ear className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{row.heard ? `Heard: “${row.heard}”` : 'Typed by hand'}</span>
        </p>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove draft ${index + 1}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="col-span-1 flex flex-col gap-1.5">
          <Label htmlFor={id('quantity')} className="text-xs">Quantity</Label>
          <Input type="number" min="1" max="100000" inputMode="numeric" value={row.quantity} onChange={(e) => onChange({ quantity: e.target.value })} {...field('quantity')} />
          {hint('quantity')}
        </div>
        <div className="col-span-1 flex flex-col gap-1.5">
          <Label htmlFor={id('unit')} className="text-xs">Unit</Label>
          <Select id={id('unit')} value={row.unit} onChange={(e) => onChange({ unit: e.target.value })}>
            {enums.unit.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor={id('itemName')} className="text-xs">Item</Label>
          <Input value={row.itemName} maxLength={80} onChange={(e) => onChange({ itemName: e.target.value })} {...field('itemName')} />
          {hint('itemName')}
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor={id('category')} className="text-xs">Category</Label>
          <Select value={row.category} onChange={(e) => onChange({ category: e.target.value })} {...field('category')}>
            <option value="">Choose…</option>
            {enums.category.map((c) => <option key={c} value={c}>{humanise(c)}</option>)}
          </Select>
          {hint('category')}
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor={id('expiresOn')} className="text-xs">Expires on</Label>
          <Input type="date" value={row.expiresOn} onChange={(e) => onChange({ expiresOn: e.target.value })} {...field('expiresOn')} />
          {hint('expiresOn')}
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor={id('donor')} className="text-xs">Donor</Label>
          <Select id={id('donor')} value={row.donor} onChange={(e) => onChange({ donor: e.target.value })}>
            <option value="">{row.donorGuess ? `Not recognised: “${row.donorGuess}”` : 'No donor'}</option>
            {donors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </Select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor={id('location')} className="text-xs">Location</Label>
          <Select id={id('location')} value={row.location} onChange={(e) => onChange({ location: e.target.value })}>
            {enums.location.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </div>
      </div>
      {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
    </Card>
  );
}
