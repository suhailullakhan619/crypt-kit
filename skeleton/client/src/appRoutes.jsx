/**
 * App-specific routes and sidebar links (Req 13.2, 16.x).
 *
 * Each entry: { path, element, label?, icon? (lucide kebab name), roles? (omit = everyone) }
 * Entries with a `label` appear in the sidebar under the resources.
 */
import ScanLookup from './pages/ScanLookup';
import { printLabelSheet } from './components/qr/printLabelSheet';
import { recordTitle } from './lib/format';
import qrCodes from './qrCodes';

const appRoutes = [
  // "Scan or find": camera, photo or typed ID. `/scan/<id>` is the link inside every QR label.
  { path: 'scan', element: <ScanLookup />, label: 'Scan or find', icon: 'scan-line' },
  { path: 'scan/:code', element: <ScanLookup /> },
];

export default appRoutes;

/** Report presets shown on the Reports page: { label, resource, filters, title }. */
export const reportPresets = [];

/** "Print QR labels" for every resource in qrCodes.js: an A4 sheet of 24 labels from the selected rows. */
const labelAction = (key) => ({
  label: 'Print QR labels',
  icon: 'printer',
  run: ({ items, resource, appName }) => printLabelSheet({ items, config: qrCodes[key], appName, titleOf: (i) => recordTitle(resource, i) }),
});

/**
 * Bulk actions on a resource's list page (Req 16.14). When any action is available to the
 * user, rows get checkboxes and an action bar appears once something is selected.
 * `run({ api, ids, items, resource, appName })` may return a message string (shown as a toast).
 * `roles` omitted = every role that can read the resource (the Superuser always qualifies).
 */
export const bulkActions = Object.fromEntries(Object.keys(qrCodes).map((key) => [key, [labelAction(key)]]));
