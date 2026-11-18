import Intake from './pages/Intake';
import Distribute from './pages/Distribute';
import Impact from './pages/Impact';
import Insights from './pages/Insights';
import ScanLookup from './pages/ScanLookup';
import { printLabelSheet } from './components/qr/printLabelSheet';
import { recordTitle } from './lib/format';
import qrCodes from './qrCodes';

/**
 * Pantry Ghost routes and sidebar links (skeleton Req 13.2, 16.x).
 * Each entry: { path, element, label?, icon? (lucide kebab name), roles? (omit = everyone) }.
 * The superuser (Coordinator) sees every link; pages also guard themselves by permission.
 */
const appRoutes = [
  { path: 'intake', element: <Intake />, label: 'Intake', icon: 'package-plus', roles: ['Volunteer'] },
  { path: 'distribute', element: <Distribute />, label: 'Distribute', icon: 'hand-heart', roles: ['Volunteer'] },
  // "Scan or find": camera, photo or typed item ID. `/scan/<id>` is the link inside every QR label.
  { path: 'scan', element: <ScanLookup />, label: 'Scan or find', icon: 'scan-line' },
  { path: 'scan/:code', element: <ScanLookup /> },
  { path: 'insights', element: <Insights />, label: 'Insights', icon: 'lightbulb', roles: ['Volunteer'] },
  { path: 'impact', element: <Impact />, label: 'Impact report', icon: 'chart-column', roles: ['Board'] },
];

export default appRoutes;

/** Report presets shown on the Reports page: { label, resource, filters, title }. */
export const reportPresets = [
  { label: 'Use-first list', resource: 'stock-lots', filters: { status: 'ExpiringSoon' }, title: 'Use first — expiring soon' },
  { label: 'Expired stock', resource: 'stock-lots', filters: { status: 'Expired' }, title: 'Expired stock to clear' },
];

/** Bulk actions on generic list pages (skeleton Req 16.14). Pantry Ghost needs none yet. */
export const bulkActions = {
  // An A4 sheet of 24 QR labels for shelf bins and fridge crates, from the selected stock rows.
  'stock-lots': [{
    label: 'Print QR labels',
    icon: 'printer',
    roles: ['Volunteer'],
    run: ({ items, resource, appName }) => printLabelSheet({ items, config: qrCodes['stock-lots'], appName, titleOf: (i) => recordTitle(resource, i) }),
  }],
};
