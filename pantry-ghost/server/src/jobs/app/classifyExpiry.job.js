import { reclassifyAll } from '../../services/expiryService.js';

/**
 * Re-classifies lot expiry at boot and hourly (Req 3.2). Per-category windows need more than the
 * skeleton's single-state Due Rule, which is why this lives in the jobs/app extension point.
 */
export default {
  name: 'classify-expiry',
  schedule: '0 * * * *',
  runAtBoot: true,
  run: ({ registry, now }) => reclassifyAll(registry, now),
};
