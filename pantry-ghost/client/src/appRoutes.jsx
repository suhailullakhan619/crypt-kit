import Intake from './pages/Intake';
import Distribute from './pages/Distribute';
import Impact from './pages/Impact';

/**
 * Pantry Ghost routes and sidebar links (skeleton Req 13.2, 16.x).
 * Each entry: { path, element, label?, icon? (lucide kebab name), roles? (omit = everyone) }.
 * The superuser (Coordinator) sees every link; pages also guard themselves by permission.
 */
const appRoutes = [
  { path: 'intake', element: <Intake />, label: 'Intake', icon: 'package-plus', roles: ['Volunteer'] },
  { path: 'distribute', element: <Distribute />, label: 'Distribute', icon: 'hand-heart', roles: ['Volunteer'] },
  { path: 'impact', element: <Impact />, label: 'Impact report', icon: 'chart-column', roles: ['Board'] },
];

export default appRoutes;

/** Report presets shown on the Reports page: { label, resource, filters, title }. */
export const reportPresets = [
  { label: 'Use-first list', resource: 'stock-lots', filters: { status: 'ExpiringSoon' }, title: 'Use first — expiring soon' },
  { label: 'Expired stock', resource: 'stock-lots', filters: { status: 'Expired' }, title: 'Expired stock to clear' },
];
