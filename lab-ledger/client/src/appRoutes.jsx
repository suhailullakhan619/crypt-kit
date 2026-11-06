/**
 * Lab Ledger routes and sidebar links (skeleton Req 13.2, 16.x).
 *
 * Each entry: { path, element, label?, icon? (lucide kebab name), roles? (omit = everyone) }
 * Entries with a `label` appear in the sidebar under "Workflows". `r/checkouts/:id` is more specific
 * than the generic `r/:key/:id`, so React Router renders the workflow-aware checkout page instead.
 */
import Scan from './pages/Scan';
import MyCheckouts from './pages/MyCheckouts';
import CheckoutDetail from './pages/CheckoutDetail';
import { printLabels } from './api/lab';

const appRoutes = [
  { path: 'scan', element: <Scan />, label: 'Scan a label', icon: 'scan-line' },
  { path: 'scan/:tag', element: <Scan /> },
  { path: 'my-checkouts', element: <MyCheckouts />, label: 'My checkouts', icon: 'clipboard-list' },
  { path: 'r/checkouts/:id', element: <CheckoutDetail /> },
];

export default appRoutes;

/** Report presets shown on the Reports page: { label, resource, filters, title }. */
export const reportPresets = [
  {
    // lab-ledger Req 7.2 — columns come from the equipment resource's report.columns
    label: 'Calibration Audit',
    resource: 'equipment',
    filters: { requiresCalibration: 'true' },
    title: 'Calibration Audit',
  },
  {
    label: 'Overdue loans',
    resource: 'checkouts',
    filters: { status: 'Overdue' },
    title: 'Overdue loans',
  },
];

/**
 * Bulk actions on generic list pages (skeleton Req 16.14). Staff select equipment rows and print
 * QR labels (lab-ledger Req 5.1): A4 sheets, 3 × 8 labels, max 60 per PDF.
 */
export const bulkActions = {
  equipment: [
    {
      label: 'Print labels',
      icon: 'printer',
      roles: ['Technician'], // LabManager is the superuser and always qualifies
      run: async ({ api, ids }) => {
        if (ids.length > 60) throw new Error('Select at most 60 items per label sheet PDF');
        await printLabels(api, ids);
        return `Labels for ${ids.length} item${ids.length === 1 ? '' : 's'} downloaded`;
      },
    },
  ],
};
