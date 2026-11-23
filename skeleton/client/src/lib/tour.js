/** Where the tour remembers that a user has seen it (per user, so a shared browser still greets each person once). */
export const tourKey = (userId) => `crypt-tour:${userId ?? 'anon'}`;

/**
 * Should the tour open by itself? Only for a first visit to a production build, never for an automated
 * browser (the checks that drive the app should not meet a dialog), and always when `?tour=1` asks for it.
 */
export function shouldAutoOpen({ seen, prod, webdriver, forced }) {
  if (forced) return true;
  return !!prod && !webdriver && !seen;
}

/**
 * The tour's steps for this app.
 * @param {{ appName: string, hasQr: boolean, example?: string }} opts
 * @returns {Array<{ id: string, title: string, body: string, action?: { label: string, to: string } }>}
 */
export function buildSteps({ appName, hasQr, example }) {
  const steps = [
    { id: 'welcome', title: `Welcome to ${appName}`, body: 'Here is a 30-second look at the four things worth knowing. You can skip this at any time.' },
    { id: 'search', title: 'Find anything', body: 'Press Ctrl+K (⌘K on a Mac), or tap Search at the top. It finds records in every area you can read, jumps to any page and starts new records.' },
    {
      id: 'assistant',
      title: 'Ask in plain words',
      body: `Open the assistant and ask things like “${example || 'what is on my plate'}”. It answers from your own data, lists the records as links, and can add a note or a reminder for you to confirm.`,
      action: { label: 'Open the assistant', to: '/voice' },
    },
  ];
  if (hasQr) {
    steps.push({
      id: 'scan',
      title: 'Scan a label',
      body: 'Every item has a short ID and a QR code. Point your phone at a label, or type the ID on the Scan page, to open the item.',
      action: { label: 'Open the scan page', to: '/scan' },
    });
  }
  steps.push({
    id: 'yours',
    title: 'Make it yours',
    body: 'Switch between dark and light with the sun or moon button. On a phone, use your browser’s “Add to Home screen” to install the app. To see this tour again, press Ctrl+K and type “tour”.',
  });
  return steps;
}
