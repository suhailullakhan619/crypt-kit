/**
 * Demo records for the example `notes` resource. Files in seed/data/ default-export
 * `{ resource, records(ctx) }`; ctx = { users: { byRole, all }, now, pick(key) }.
 */
const DAY = 86400000;

export default {
  resource: 'notes',
  records: ({ users, now }) => {
    const member = users.byRole.Member ?? users.all[0];
    const admin = users.byRole.Admin ?? users.all[0];
    const at = (days) => new Date(now.getTime() + days * DAY);
    return [
      { title: 'Restock eye of newt', body: 'Supplier says Thursday.', priority: 'High', owner: member, dueDate: at(2), tags: ['Potion'], subtasks: [{ text: 'Call the supplier', done: true }, { text: 'Count the jars', done: false }, { text: 'Place the order', done: false }] },
      { title: 'Polish the crystal ball', priority: 'Low', owner: member, dueDate: at(9), tags: ['Ritual'] },
      { title: 'Renew broom insurance', priority: 'Medium', owner: admin, dueDate: at(-3), tags: ['Admin'] },
      { title: 'Rehearse the séance script', body: 'Lines for the third spirit still missing.', priority: 'High', owner: member, dueDate: at(5), tags: ['Ritual', 'Haunting'], subtasks: [{ text: 'Write the third spirit lines', done: false }, { text: 'Print the script', done: false }] },
      { title: 'Fix the creaky stair (keep it creaky?)', priority: 'Low', owner: admin, pinned: true, tags: ['Haunting'] },
      { title: 'Label the potion shelf', priority: 'Medium', owner: member, dueDate: at(-1), status: 'Open', tags: ['Potion', 'Admin'], subtasks: [{ text: 'Buy labels', done: true }, { text: 'Sort bottles by colour', done: true }, { text: 'Stick the labels on', done: false }, { text: 'Dust the shelf', done: false }, { text: 'Photograph it', done: false }] },
      { title: 'Order more candles', priority: 'Medium', owner: admin, status: 'Done', tags: ['Admin'] },
      { title: 'Update the spellbook index', priority: 'Low', owner: member, dueDate: at(14) },
    ];
  },
};
