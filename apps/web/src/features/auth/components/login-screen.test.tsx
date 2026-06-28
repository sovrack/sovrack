import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const loginMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('@/features/auth/api/use-auth', () => ({
  useAuth: () => ({ login: loginMock }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));
vi.mock('@/shared/lib/api', () => ({
  getApiErrorMessage: (e: unknown) => (e as Error)?.message ?? '',
}));

import { LoginScreen } from './login-screen';

describe('LoginScreen (auth critical path)', () => {
  beforeEach(() => {
    loginMock.mockReset();
    replaceMock.mockReset();
  });

  const fillAndSubmit = (email: string, password: string) => {
    fireEvent.change(screen.getByPlaceholderText('you@company.com'), {
      target: { value: email },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: password },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  };

  it('submits credentials and redirects to /dashboard on success', async () => {
    loginMock.mockResolvedValue(undefined);
    render(<LoginScreen />);
    fillAndSubmit('a@b.com', 'pw');

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith('a@b.com', 'pw'),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows an error and stays on the page when login fails', async () => {
    loginMock.mockRejectedValue(new Error('Invalid credentials'));
    render(<LoginScreen />);
    fillAndSubmit('x@y.com', 'bad');

    await waitFor(() =>
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument(),
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
