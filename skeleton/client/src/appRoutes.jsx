/**
 * App-specific routes and sidebar links (Req 13.2, 16.x). The skeleton ships none.
 *
 * Each entry: { path, element, label?, icon? (lucide kebab name), roles? (omit = everyone) }
 * Entries with a `label` appear in the sidebar under the resources.
 *
 * Example:
 *   import Scan from './pages/Scan';
 *   export default [{ path: 'scan', element: <Scan />, label: 'Scan label', icon: 'scan-line' }];
 */
const appRoutes = [];

export default appRoutes;

/** Report presets shown on the Reports page: { label, resource, filters, title }. */
export const reportPresets = [];

/**
 * Bulk actions on a resource's list page (Req 16.14). When any action is available to the
 * user, rows get checkboxes and an action bar appears once something is selected.
 *
 *   export const bulkActions = {
 *     equipment: [{ label: 'Print labels', icon: 'printer', roles: ['Technician'],
 *                   run: async ({ api, ids, items }) => { ... } }],
 *   };
 *
 * `roles` omitted = every role that can read the resource (the Superuser always qualifies).
 * `run` may return a message string, which is shown as a success toast.
 */
export const bulkActions = {};
