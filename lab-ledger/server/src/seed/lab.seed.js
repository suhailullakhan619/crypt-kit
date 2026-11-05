/**
 * Lab Ledger demo data (lab-ledger Req 7.3): 3 labs, 40 equipment items across every category,
 * 25 calibrations and checkouts in every status (including 2 overdue).
 *
 * The skeleton seeds each resource from seed/data/<resource>.js with `insertMany`, which bypasses
 * hooks — so everything hooks or workflows would normally compute (equipment status, nextCalibration,
 * approvedBy, returnedAt…) is computed here, consistently:
 *   - an item is CheckedOut iff it has exactly one Active/Overdue checkout
 *   - nextCalibration = latest calibration + interval; past due → CalibrationDue
 *   - a failed latest calibration → Maintenance
 *
 * Pure functions of the seed ctx ({ users, now, pick }), so the demo is deterministic for a given `now`.
 */
const DAY = 86400000;

export const LABS = [
  { name: 'Physics B-12', building: 'Maxwell Building', room: 'B-12' },
  { name: 'Biology 2.04', building: 'Franklin Wing', room: '2.04' },
  { name: 'Chemistry C-3', building: 'Curie Hall', room: 'C-3' },
];

/**
 * lab: index into LABS. cal: [intervalDays, daysSinceLastCalibration, results newest-first].
 * status here is the "base" status before calibration and loans are applied.
 */
export const EQUIPMENT = [
  // Physics B-12
  { name: 'Digital Oscilloscope', category: 'Electronics', lab: 0, cal: [365, 120, ['Pass', 'Adjusted']] },
  { name: 'Function Generator', category: 'Electronics', lab: 0 },
  { name: 'Bench Power Supply', category: 'Electronics', lab: 0, condition: 'Fair' },
  { name: 'Digital Multimeter', category: 'Measurement', lab: 0, cal: [365, 200, ['Pass']] },
  { name: 'Handheld Multimeter', category: 'Measurement', lab: 0 },
  { name: 'Spectrum Analyzer', category: 'Measurement', lab: 0, cal: [365, 300, ['Pass', 'Pass']] },
  { name: 'Logic Analyzer', category: 'Electronics', lab: 0 },
  { name: 'Soldering Station', category: 'Electronics', lab: 0, condition: 'Fair' },
  { name: 'Laser Diode Kit', category: 'Other', lab: 0, notes: 'Class 3R — goggles required.' },
  { name: 'Optical Bench Kit', category: 'Imaging', lab: 0 },
  { name: 'Geiger Counter', category: 'Safety', lab: 0, cal: [365, 350, ['Pass', 'Pass']] },
  { name: 'Thermal Camera', category: 'Imaging', lab: 0 },
  { name: 'LCR Meter', category: 'Measurement', lab: 0, cal: [180, 60, ['Pass']] },
  { name: 'Infrared Thermometer', category: 'Measurement', lab: 0 },
  // Biology 2.04
  { name: 'Compound Microscope', category: 'Imaging', lab: 1 },
  { name: 'Stereo Microscope', category: 'Imaging', lab: 1 },
  { name: 'Fluorescence Microscope', category: 'Imaging', lab: 1, status: 'Maintenance', condition: 'Damaged', notes: 'Mercury lamp failed — replacement on order.' },
  { name: 'Benchtop Centrifuge', category: 'Biology', lab: 1, cal: [365, 90, ['Pass']] },
  { name: 'Microcentrifuge', category: 'Biology', lab: 1 },
  { name: 'PCR Thermal Cycler', category: 'Biology', lab: 1, cal: [365, 30, ['Adjusted', 'Pass']] },
  { name: 'Gel Electrophoresis Unit', category: 'Biology', lab: 1 },
  { name: 'Micropipette Set 0.5-10 uL', category: 'Biology', lab: 1, cal: [90, 85, ['Pass', 'Adjusted', 'Pass']] },
  { name: 'Micropipette Set 20-200 uL', category: 'Biology', lab: 1, cal: [90, 100, ['Pass', 'Pass']] },
  { name: 'Autoclave', category: 'Safety', lab: 1, cal: [180, 40, ['Pass', 'Pass']] },
  { name: 'Incubator Shaker', category: 'Biology', lab: 1 },
  { name: 'Biosafety Cabinet', category: 'Safety', lab: 1, cal: [365, 150, ['Pass']] },
  { name: 'Spectrophotometer', category: 'Measurement', lab: 1, cal: [180, 10, ['Fail', 'Pass']], notes: 'Wavelength drift at 340 nm.' },
  // Chemistry C-3
  { name: 'Analytical Balance', category: 'Measurement', lab: 2, cal: [180, 200, ['Pass', 'Adjusted']] },
  { name: 'Precision Balance', category: 'Measurement', lab: 2 },
  { name: 'pH Meter', category: 'Chemistry', lab: 2, cal: [30, 26, ['Pass', 'Adjusted']] },
  { name: 'Magnetic Stirrer Hotplate', category: 'Chemistry', lab: 2 },
  { name: 'Rotary Evaporator', category: 'Chemistry', lab: 2 },
  { name: 'Fume Extraction Arm', category: 'Safety', lab: 2 },
  { name: 'Conductivity Meter', category: 'Chemistry', lab: 2 },
  { name: 'UV-Vis Spectrometer', category: 'Chemistry', lab: 2 },
  { name: 'Melting Point Apparatus', category: 'Chemistry', lab: 2 },
  { name: 'Titration Burette Set', category: 'Chemistry', lab: 2 },
  { name: 'Water Bath', category: 'Chemistry', lab: 2, condition: 'Fair' },
  { name: 'Eyewash Station Kit', category: 'Safety', lab: 2 },
  { name: 'Chart Recorder', category: 'Other', lab: 2, status: 'Retired', notes: 'Replaced by the data logger.' },
];

export const tagOf = (i) => `LL-${String(i + 1).padStart(4, '0')}`;
const indexOf = (name) => EQUIPMENT.findIndex((e) => e.name === name);
const at = (now, days) => new Date(now.getTime() + days * DAY);

/**
 * Checkouts in every status. eq: equipment name; who: 'Student' | 'Technician'; days relative to now.
 */
export const CHECKOUTS = [
  { eq: 'Digital Oscilloscope', who: 'Student', status: 'Active', out: -4, due: 3, purpose: 'Signals lab — week 6' },
  { eq: 'Microcentrifuge', who: 'Technician', status: 'Active', out: -1, due: 6, purpose: 'Prep for practical class' },
  { eq: 'Titration Burette Set', who: 'Student', status: 'Active', out: -2, due: 12, purpose: 'Final-year project titrations' },
  { eq: 'Digital Multimeter', who: 'Student', status: 'Overdue', out: -12, due: -2, purpose: 'Robotics club build' },
  { eq: 'Thermal Camera', who: 'Student', status: 'Overdue', out: -20, due: -5, purpose: 'Heat-loss survey' },
  { eq: 'Function Generator', who: 'Student', status: 'Requested', created: -1, due: 5, purpose: 'Resonance experiment' },
  { eq: 'Benchtop Centrifuge', who: 'Student', status: 'Requested', created: 0, due: 4, purpose: 'DNA extraction' },
  { eq: 'Compound Microscope', who: 'Student', status: 'Returned', out: -30, due: -23, back: -24, condition: 'Good', purpose: 'Cell biology practical' },
  { eq: 'Bench Power Supply', who: 'Student', status: 'Returned', out: -21, due: -14, back: -15, condition: 'Fair', purpose: 'Motor control lab' },
  { eq: 'Fluorescence Microscope', who: 'Technician', status: 'Returned', out: -40, due: -33, back: -34, condition: 'Damaged', purpose: 'Staining demo', notes: 'Lamp flickering on return.' },
  { eq: 'Spectrum Analyzer', who: 'Student', status: 'Rejected', created: -9, due: -2, purpose: 'Ham radio hobby', reason: 'Booked for the RF exam that week.' },
  { eq: 'Stereo Microscope', who: 'Student', status: 'Cancelled', created: -6, due: 1, purpose: 'Insect anatomy sketching' },
];

/** Equipment status after loans and calibrations (the invariants listed above). */
export function equipmentStatus(i, now) {
  const e = EQUIPMENT[i];
  if (e.status === 'Retired') return 'Retired';
  if (CHECKOUTS.some((c) => indexOf(c.eq) === i && (c.status === 'Active' || c.status === 'Overdue'))) return 'CheckedOut';
  if (e.cal?.[2][0] === 'Fail') return 'Maintenance';
  if (e.status) return e.status;
  const next = nextCalibration(i, now);
  return next && next < now ? 'CalibrationDue' : 'Available';
}

export function nextCalibration(i, now) {
  const cal = EQUIPMENT[i].cal;
  return cal ? at(now, cal[0] - cal[1]) : null;
}

export function labRecords({ users }) {
  const manager = users.byRole.LabManager ?? users.all[0];
  return LABS.map((l) => ({ ...l, manager }));
}

export function equipmentRecords({ now, pick }) {
  return EQUIPMENT.map((e, i) => {
    const status = equipmentStatus(i, now);
    const rec = {
      name: e.name,
      assetTag: tagOf(i),
      serialNumber: `${e.category.slice(0, 3).toUpperCase()}-${(20231 + i * 7919).toString(36).toUpperCase()}`,
      category: e.category,
      lab: pick('labs', e.lab),
      status,
      condition: e.condition ?? 'Good',
      requiresCalibration: !!e.cal,
      notes: e.notes,
    };
    if (e.cal) Object.assign(rec, { calibrationIntervalDays: e.cal[0], nextCalibration: nextCalibration(i, now) });
    if (status === 'Retired') rec.retiredAt = at(now, -60);
    return rec;
  });
}

export function calibrationRecords({ now, pick, users }) {
  const tech = users.byRole.Technician ?? users.all[0];
  const out = [];
  EQUIPMENT.forEach((e, i) => {
    if (!e.cal) return;
    const [interval, ago, results] = e.cal;
    results.forEach((result, k) => {
      out.push({
        equipment: pick('equipment', i),
        performedAt: at(now, -(ago + k * interval)),
        performedBy: tech,
        result,
        certificateNo: `CAL-${tagOf(i).slice(3)}-${String(results.length - k).padStart(2, '0')}`,
        notes: result === 'Fail' ? e.notes ?? 'Out of tolerance.' : result === 'Adjusted' ? 'Adjusted to within tolerance.' : undefined,
      });
    });
  });
  return out;
}

export function checkoutRecords({ now, pick, users }) {
  const tech = users.byRole.Technician ?? users.all[0];
  return CHECKOUTS.map((c) => {
    const borrower = users.byRole[c.who] ?? users.all[users.all.length - 1];
    const rec = {
      equipment: pick('equipment', indexOf(c.eq)),
      borrower,
      createdBy: borrower,
      status: c.status,
      purpose: c.purpose,
      dueBack: at(now, c.due),
      createdAt: at(now, c.created ?? (c.out ?? 0) - 1),
    };
    if (c.out !== undefined) Object.assign(rec, { approvedBy: tech, checkedOutAt: at(now, c.out) });
    if (c.status === 'Returned') Object.assign(rec, { receivedBy: tech, returnedAt: at(now, c.back), returnCondition: c.condition, returnNotes: c.notes });
    if (c.status === 'Rejected') rec.rejectReason = c.reason;
    return rec;
  });
}
