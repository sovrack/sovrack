import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        body
      </Modal>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title, body and close button when open', () => {
    render(
      <Modal open onClose={() => {}} title="My dialog">
        hello
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('My dialog')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('closes on Escape and on close-button click', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="t">
        x
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not close on Escape when dismissable is false', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} dismissable={false} hideClose title="t">
        x
      </Modal>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders a footer when provided', () => {
    render(
      <Modal open onClose={() => {}} footer={<button type="button">Save</button>}>
        x
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
