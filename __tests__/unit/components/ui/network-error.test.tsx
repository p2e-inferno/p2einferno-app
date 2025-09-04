import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NetworkError } from '@/components/ui/network-error';

describe('NetworkError', () => {
  test('renders error message and retry button', () => {
    const onRetry = jest.fn();
    render(<NetworkError error="Failed to fetch" onRetry={onRetry} />);

    expect(screen.getByText(/Network Connection Issue|Connection Timeout|Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try Again|Retrying/i })).toBeInTheDocument();
  });

  test('calls onRetry when clicking Try Again', () => {
    const onRetry = jest.fn();
    render(<NetworkError error="fetch failed" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  test('disables button while retrying', () => {
    const onRetry = jest.fn();
    render(<NetworkError error="timeout" onRetry={onRetry} isRetrying />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });
});

