/**
 * Records that carry a QR code and a short ID, used by the detail-page QR card, "Scan or find" and
 * the "Print QR labels" bulk action. Apps raised from the skeleton edit this file.
 *
 * Key: resource key. Value:
 *  - idField  the field holding the short ID people type (e.g. 'code' → N-0001)
 *  - idLabel  what that ID is called on screen
 *  - example  a sample ID shown as a hint
 *  - target(record) → { path, caption? }  where the QR leads (inside this portal) and the text under it
 */
export const qrCodes = {
  notes: {
    idField: 'code',
    idLabel: 'Note ID',
    example: 'N-0001',
    target: (r) => ({ path: r.code ? `/scan/${encodeURIComponent(r.code)}` : `/r/notes/${r._id}`, caption: r.code }),
  },
};

export default qrCodes;
