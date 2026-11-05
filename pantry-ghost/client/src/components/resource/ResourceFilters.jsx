import { Input, Label } from '../ui/input';
import { Select } from '../ui/select';
import { RefSelect } from './RefSelect';
import { humanise } from '../../lib/utils';

/**
 * Filter controls for every `filter: true` field (Req 13.3). Controlled by a plain
 * `{ field: string }` object so it can live in the URL search params.
 */
export function ResourceFilters({ resource, values, onChange, idPrefix = 'filter' }) {
  const fields = resource.fields.filter((f) => f.filter);
  if (!fields.length) return null;
  const set = (name, v) => onChange({ ...values, [name]: v });

  return (
    <>
      {fields.map((f) => {
        const id = `${idPrefix}-${f.name}`;
        const value = values[f.name] ?? '';
        let control;
        if (f.type === 'enum') {
          control = (
            <Select id={id} value={value} onChange={(e) => set(f.name, e.target.value)}>
              <option value="">Any</option>
              {f.values.map((v) => <option key={v} value={v}>{humanise(v)}</option>)}
            </Select>
          );
        } else if (f.type === 'boolean') {
          control = (
            <Select id={id} value={value} onChange={(e) => set(f.name, e.target.value)}>
              <option value="">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Select>
          );
        } else if (f.type === 'ref') {
          control = <RefSelect id={id} field={f} placeholder="Any" value={value} onChange={(e) => set(f.name, e.target.value)} />;
        } else if (f.type === 'date') {
          control = <Input id={id} type="date" value={value} onChange={(e) => set(f.name, e.target.value)} />;
        } else {
          control = <Input id={id} type={f.type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => set(f.name, e.target.value)} />;
        }
        return (
          <div key={f.name} className="flex min-w-[9rem] flex-1 flex-col gap-1.5 sm:max-w-[13rem]">
            <Label htmlFor={id} className="text-xs text-muted-foreground">{f.label}</Label>
            {control}
          </div>
        );
      })}
    </>
  );
}
