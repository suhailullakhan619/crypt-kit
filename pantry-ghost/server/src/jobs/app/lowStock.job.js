import { notifyLowStock } from '../../services/insightsService.js';

/** Daily at 08:00 and once at boot: tells staff which categories are below their minimum (once a week each). */
export default {
  name: 'low-stock',
  schedule: '0 8 * * *',
  runAtBoot: true,
  run: ({ now }) => notifyLowStock(now),
};
