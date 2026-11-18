/**
 * Records that carry a QR code and a short ID, used by the detail-page QR card (and the Scan page).
 * Key: resource key. Value: { idField, idLabel, example, target(record) → { path, caption? } }.
 *
 * Equipment uses the same link as the printed label sheet (`/scan/<asset tag>`), so scanning the
 * code on screen or on the bench opens the item card with Borrow / Return in one step.
 */
export const qrCodes = {
  equipment: {
    idField: 'assetTag',
    idLabel: 'Asset tag',
    example: 'LL-0001',
    target: (r) => ({ path: `/scan/${encodeURIComponent(r.assetTag)}`, caption: r.assetTag }),
  },
};

export default qrCodes;
