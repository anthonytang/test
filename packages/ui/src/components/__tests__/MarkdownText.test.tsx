import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownText } from '../MarkdownText';

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: vi.fn(({ children, components }) => {
    return <div data-testid="react-markdown">{children}</div>;
  }),
}));

describe('MarkdownText', () => {
  it('should render markdown text', () => {
    const { getByTestId } = render(<MarkdownText text="# Heading" />);
    expect(getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <MarkdownText text="Test" className="custom-class" />
    );
    const span = container.querySelector('span.custom-class');
    expect(span).toBeInTheDocument();
  });

  it('should render with default className when not provided', () => {
    const { container } = render(<MarkdownText text="Test" />);
    const span = container.querySelector('span');
    expect(span).toBeInTheDocument();
    expect(span?.className).toBe('');
  });
});

