import { useForm } from 'react-hook-form';
import { FieldInput } from './FieldInput';
import { Button } from '../ui/button';
import { inputValue } from '../../lib/format';

/** Fields a user may edit in the generic form: everything visible in meta except the status-flow field on edit. */
export function editableFields(resource, { editing }) {
  const flowField = resource.statusFlow?.field;
  const locked = new Set(resource.statusFlow?.workflowOnly ?? []);
  return resource.fields.filter((f) => {
    if (f.formHidden) return false; // set by the server (hooks/workflow); still shown in lists and details
    if (editing && f.name === flowField) return false; // status changes go through transition buttons
    if (!editing && f.name === flowField && f.values?.every((v) => locked.has(v))) return false;
    return true;
  });
}

/** Turns form values into an API body (empty → null, enum default handling). */
function toBody(fields, values) {
  const body = {};
  for (const f of fields) {
    let v = values[f.name];
    if (v === '' || v === undefined) v = null;
    // datetime-local has no zone: read it in the browser's zone and send an unambiguous ISO instant.
    if (v && f.type === 'date' && f.time) { const d = new Date(v); v = Number.isNaN(d.getTime()) ? v : d.toISOString(); }
    body[f.name] = v;
  }
  return body;
}

/**
 * Generic create/edit form rendered from meta (Req 13.4). Server field errors (400 `fields`)
 * are shown inline under the matching inputs.
 *
 * @param {{ resource: object, initial?: object, onSubmit: (body) => Promise<any>, submitLabel?: string, onCancel?: () => void }} props
 */
export function ResourceForm({ resource, initial, onSubmit, submitLabel = 'Save', onCancel }) {
  const editing = !!initial;
  const fields = editableFields(resource, { editing });
  const locked = new Set(resource.statusFlow?.workflowOnly ?? []);

  const defaults = Object.fromEntries(
    fields.map((f) => {
      if (initial) return [f.name, inputValue(f, initial[f.name])];
      if (f.default !== undefined) return [f.name, f.default];
      return [f.name, inputValue(f, null)];
    })
  );
  // Workflow-only values must not be offered as a starting status.
  const visible = fields.map((f) => (f.name === resource.statusFlow?.field ? { ...f, values: f.values.filter((v) => !locked.has(v)) } : f));

  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: defaults });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toBody(fields, values));
    } catch (err) {
      const serverFields = err?.response?.data?.fields;
      if (serverFields) for (const [k, msg] of Object.entries(serverFields)) setError(k, { type: 'server', message: msg });
      throw err;
    }
  });

  return (
    <form onSubmit={(e) => submit(e).catch(() => {})} noValidate className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {visible.map((f) => (
          <FieldInput key={f.name} field={f} control={control} register={register} error={errors[f.name]?.message} />
        ))}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  );
}
