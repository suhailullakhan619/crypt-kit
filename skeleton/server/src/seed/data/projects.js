/**
 * Demo records for the `projects` resource. Default-exports `{ resource, records(ctx) }`; ctx = { users, now, pick }.
 */
const DAY = 86400000;
const HOUR = 3600000;
export default {
  resource: 'projects',
  records: ({ users, now }) => {
    const member = users.byRole.Member ?? users.all[0];
    const admin = users.byRole.Admin ?? users.all[0];
    const at = (days) => new Date(now.getTime() + days * DAY);
    return [
      { name: 'Haunt the east wing', description: 'Cold spots, creaking floors and one very polite poltergeist.', status: 'Active', owner: member, startDate: at(-20), dueDate: at(12),
        milestones: [{ text: 'Survey the east wing', done: true }, { text: 'Order chains and fog machine', done: true }, { text: 'Rehearse the groans', done: true }, { text: 'Open to visitors', done: false }, { text: 'Collect feedback', done: false }] },
      { name: 'Spring cleaning of the crypt', description: 'Dust, cobwebs (keep half) and the great sarcophagus polish.', status: 'Planning', owner: admin, startDate: at(7), dueDate: at(30) },
      { name: 'Séance season launch', status: 'Active', owner: member, startDate: at(-30), dueDate: at(-2),
        milestones: [{ text: 'Book the spirits', done: true }, { text: 'Print the programme', done: false }] },
      { name: 'Library of lost spells', description: 'Catalogue the shelf of unlabelled scrolls.', status: 'Completed', owner: admin, startDate: at(-60), dueDate: at(-15),
        milestones: [{ text: 'Sort scrolls', done: true }, { text: 'Label shelves', done: true }] },
      { name: 'Moat repairs', status: 'OnHold', owner: member, startDate: at(-10), dueDate: at(45) },
    ];
  },
};
