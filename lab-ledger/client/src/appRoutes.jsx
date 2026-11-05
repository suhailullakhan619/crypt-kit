/**
 * Lab Ledger routes and sidebar links (skeleton Req 13.2, 16.x).
 *
 * Each entry: { path, element, label?, icon? (lucide kebab name), roles? (omit = everyone) }
 * Entries with a `label` appear in the sidebar under "Workflows". `r/checkouts/:id` is more specific
 * than the generic `r/:key/:id`, so React Router renders the workflow-aware checkout page instead.
 */
import Scan from './pages/Scan';
import MyCheckouts from './pages/MyCheckouts';
import PrintLabels from './pages/PrintLabels';
import CheckoutDetail from './pages/CheckoutDetail';

const appRoutes = [
  { path: 'scan', element: <Scan />, label: 'Scan a label', icon: 'scan-line' },
  { path: 'scan/:tag', element: <Scan /> },
  { path: 'my-checkouts', element: <MyCheckouts />, label: 'My checkouts', icon: 'clipboard-list' },
  { path: 'labels', element: <PrintLabels />, label: 'Print labels', icon: 'printer', roles: ['Technician'] }, // + LabManager (superuser)
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
