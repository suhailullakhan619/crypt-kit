import { forwardRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';
import { useMeta } from '../../context/MetaContext';
import { searchUsers } from '../../api/users';
import { listRecords } from '../../api/resources';
import { Select } from '../ui/select';
import { recordTitle } from '../../lib/format';

/**
 * Select for a `ref` field: loads Users or records of the target resource (title field as label).
 * Uses the native select for accessibility; fine for the up-to-100 options internal tools have.
 */
export const RefSelect = forwardRef(function RefSelect({ field, placeholder = 'None', ...props }, ref) {
  const api = useApi();
  const meta = useMeta();
  const target = field.ref === 'User' ? null : meta.resource(field.ref);
  const titleField = target?.titleField ?? 'name';

  const { data = [], isLoading } = useQuery({
    queryKey: ['ref-options', field.ref],
    queryFn: async () =>
      field.ref === 'User'
        ? searchUsers(api, '')
        : (await listRecords(api, field.ref, { limit: 100, sort: titleField })).items.map((i) => ({ _id: i._id, name: target ? recordTitle(target, i) : (i[titleField] ?? i._id) })),
    staleTime: 60_000,
    enabled: field.ref === 'User' || !!target,
  });

  return (
    <Select ref={ref} {...props} disabled={props.disabled || isLoading}>
      <option value="">{isLoading ? 'Summoning…' : placeholder}</option>
      {data.map((o) => (
        <option key={o._id} value={o._id}>{o.name}</option>
      ))}
    </Select>
  );
});
