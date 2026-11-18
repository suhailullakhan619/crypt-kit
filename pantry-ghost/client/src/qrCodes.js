/**
 * Records that carry a QR code and a short ID, used by the detail-page QR card, "Scan or find" and
 * the "Print QR labels" bulk action.
 * Key: resource key. Value: { idField, idLabel, example, target(record) → { path, caption? } }.
 *
 * Stock lots get a code to stick on the shelf bin or fridge crate. Households never do: a printed
 * label must not point at a household.
 */
export const qrCodes = {
  'stock-lots': {
    idField: 'code',
    idLabel: 'Item ID',
    example: 'SL-0001',
    target: (r) => ({ path: r.code ? `/scan/${encodeURIComponent(r.code)}` : `/r/stock-lots/${r._id}`, caption: r.code }),
  },
};

export default qrCodes;
