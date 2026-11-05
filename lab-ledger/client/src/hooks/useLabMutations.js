import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useApi } from './useApi';
import { requestCheckout, approveCheckout, rejectCheckout, cancelCheckout, returnCheckout } from '../api/lab';
import { errorMessage } from '../lib/utils';

/**
 * Checkout workflow mutations with the client conventions baked in: toast on success/error and
 * invalidation of every query that shows loans or equipment status.
 */
export function useLabMutations() {
  const api = useApi();
  const qc = useQueryClient();
  const refresh = () => {
    for (const key of [['r', 'checkouts'], ['r', 'equipment'], ['dashboard'], ['lab'], ['activity']]) qc.invalidateQueries({ queryKey: key });
  };
  const make = (fn, ok) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useMutation({
      mutationFn: fn,
      onSuccess: (co) => { refresh(); toast.success(typeof ok === 'function' ? ok(co) : ok); },
      onError: (err) => toast.error(errorMessage(err)),
    });

  return {
    request: make((body) => requestCheckout(api, body), 'Request sent — a technician will brew up an answer soon'),
    approve: make((id) => approveCheckout(api, id), (co) => `Approved — ${co.equipment?.name ?? 'item'} is checked out`),
    reject: make(({ id, reason }) => rejectCheckout(api, id, reason), 'Request rejected'),
    cancel: make((id) => cancelCheckout(api, id), 'Request cancelled'),
    giveBack: make(({ id, condition, notes }) => returnCheckout(api, id, { condition, notes }),
      (co) => (co.returnCondition === 'Damaged' ? 'Returned — sent to maintenance' : 'Returned to the shelf')),
  };
}
