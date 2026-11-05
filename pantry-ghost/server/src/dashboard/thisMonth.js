import { monthKey, monthWindow } from '../domain/dates.js';
import { aggregate } from '../services/impactService.js';

/**
 * "This month" panel: units in/out, households served, people reached and waste rate.
 * Aggregates only, so Board sees it too. Client renderer: client/src/dashboard/thisMonth.jsx.
 */
export default {
  key: 'thisMonth',
  title: 'This month',
  async load({ now }) {
    const w = monthWindow(monthKey(now));
    const a = await aggregate(w);
    return {
      month: w.label,
      monthKey: monthKey(now),
      unitsIn: a.unitsIn,
      unitsOut: a.unitsOut,
      households: a.households,
      people: a.people,
      distributions: a.distributions,
      wasteRate: a.wasteRate,
      wasteUnits: a.wasteUnits,
      byCategory: a.byCategory,
    };
  },
};
