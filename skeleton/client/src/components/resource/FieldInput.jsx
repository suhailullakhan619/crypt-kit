import { Controller } from 'react-hook-form';
import { Input, Textarea, Label } from '../ui/input';
import { Select, Switch } from '../ui/select';
import { RefSelect } from './RefSelect';
import { humanise, cn } from '../../lib/utils';

/**
 * One form control per Field Spec type (Req 13.4):
 * string → input, text → textarea, number → number input, boolean → switch, date → date input,
 * enum → select (multi-enum → toggle chips), ref → RefSelect.
 */
export function FieldInput({ field, control, register, error }) {
  const id = `field-${field.name}`;
  const common = { id, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : field.help ? `${id}-help` : undefined };
  const rules = { required: field.required ? `${field.label} is required` : false };

  let control_;
  switch (field.type) {
    case 'text':
      control_ = <Textarea {...common} placeholder={field.placeholder} {...register(field.name, rules)} />;
      break;
    case 'number':
      control_ = <Input {...common} type="number" inputMode="decimal" min={field.min} max={field.max} step="any" {...register(field.name, { ...rules, setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })} />;
      break;
    case 'date':
      control_ = <Input {...common} type={field.time ? 'datetime-local' : 'date'} {...register(field.name, rules)} />;
      break;
    case 'boolean':
      control_ = (
        <Controller
          name={field.name}
          control={control}
          render={({ field: f }) => <Switch {...common} checked={!!f.value} onCheckedChange={f.onChange} />}
        />
      );
      break;
    case 'enum':
      control_ = field.multiple ? (
        <Controller
          name={field.name}
          control={control}
          render={({ field: f }) => {
            const value = Array.isArray(f.value) ? f.value : [];
            return (
              <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
                {field.values.map((v) => {
                  const on = value.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={on}
                      onClick={() => f.onChange(on ? value.filter((x) => x !== v) : [...value, v])}
                      className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', on ? 'border-primary bg-primary/15 text-primary' : 'hover:bg-muted')}
                    >
                      {humanise(v)}
                    </button>
                  );
                })}
              </div>
            );
          }}
        />
      ) : (
        <Select {...common} {...register(field.name, rules)}>
          {!field.required && <option value="">—</option>}
          {field.values.map((v) => (
            <option key={v} value={v}>{humanise(v)}</option>
          ))}
        </Select>
      );
      break;
    case 'ref':
      control_ = <RefSelect field={field} {...common} {...register(field.name, rules)} />;
      break;
    default:
      control_ = <Input {...common} placeholder={field.placeholder} maxLength={field.max} {...register(field.name, rules)} />;
  }

  return (
    <div className={cn('flex flex-col gap-2', field.type === 'text' && 'sm:col-span-2')}>
      <Label htmlFor={field.type === 'enum' && field.multiple ? undefined : id} id={`${id}-label`}>
        {field.label}
        {field.required && <span className="text-primary" aria-hidden> *</span>}
      </Label>
      {control_}
      {field.help && !error && <p id={`${id}-help`} className="text-xs text-muted-foreground">{field.help}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
