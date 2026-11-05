import { calibrationDue } from '../services/labVoiceService.js';

const RES = [
  /^(?:what|which|what s|whats)(?: equipment| items| instruments| devices| things)? (?:needs|need|is due for|are due for|needs to be|need to be|is due|are due) (?:calibration|calibrating|calibrated|a calibration)(?: this month| soon)?$/,
  /^(?:what is |whats |what s |anything |is anything )?(?:due for calibration|calibration due|calibrations due)(?: this month| soon)?$/,
  /^(?:list|show|show me)(?: the)? calibrations? due(?: this month)?$/,
];

/**
 * CALIBRATION_DUE — "what needs calibration this month?" (lab-ledger Req 6.1): items whose
 * `nextCalibration` falls on or before the end of this month, or already flagged CalibrationDue.
 */
export default {
  name: 'CALIBRATION_DUE',
  resource: 'equipment',
  examples: ['what needs calibration this month'],
  match: (t) => (RES.some((re) => re.test(t)) ? {} : null),
  handle: (_params, { config, now = new Date() }) => calibrationDue(now, { timeZone: config.reports?.timeZone }),
  respond({ count, by, items }) {
    if (count === 0) return `Nothing needs calibration before ${by}. The inspectors will be pleased.`;
    const named = items.slice(0, 5).map((i) => `${i.name} (${i.assetTag})${i.late ? ', overdue' : ''}`);
    const head = count === 1 ? `1 item needs calibration by ${by}` : `${count} items need calibration by ${by}`;
    return `${head}: ${named.join('; ')}${count > named.length ? '; and more' : ''}.`;
  },
};
