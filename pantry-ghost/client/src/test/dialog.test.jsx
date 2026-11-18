import { useState } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';

function Demo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hello</DialogTitle>
            <DialogDescription>Body</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('opens, closes with Escape and the X button, and gives focus back to the button that opened it', async () => {
    render(<Demo />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());

    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe('dialog centring', () => {
  // Regression: the dialog is centred with translate(-50%, -50%). An animation that ends in
  // `transform: none` (like fade-up) cancels it and pushes the dialog to the bottom right.
  it('uses an animation that keeps the centring translate, not fade-up', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/ui/dialog.jsx'), 'utf8');
    expect(src).toContain('animate-dialog-in');
    expect(src).not.toMatch(/DialogContent[\s\S]*?animate-fade-up[\s\S]*?export const DialogHeader/);

    const cfg = fs.readFileSync(path.resolve(__dirname, '../../tailwind.config.js'), 'utf8');
    const keyframe = cfg.match(/dialogIn:\s*\{[^\n]*\}/)?.[0] ?? '';
    expect(keyframe).toContain("'translate(-50%, -50%) scale(1)'");
    expect(keyframe).toContain('translate(-50%, calc(-50% + 8px))');
  });
});
