// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import {
  SmsQuickPasteModal,
  parseSmsText,
} from '../src/components/transactions/SmsQuickPasteModal';

describe('parseSmsText helper', () => {
  it('parses debit/expense SMS correctly', () => {
    const text = 'Your card ending in 4321 was charged $42.50 at Target on 2026-09-02.';
    const parsed = parseSmsText(text);

    expect(parsed.amount).toBe(42.5);
    expect(parsed.type).toBe('expense');
    expect(parsed.merchant).toBe('Target');
    expect(parsed.account).toBe('*4321');
    expect(parsed.date).toBe('2026-09-02');
  });

  it('parses credit/income SMS correctly', () => {
    const text = 'Salary credited $3,500.00 to account ending 9876 on 2026-09-01.';
    const parsed = parseSmsText(text);

    expect(parsed.amount).toBe(3500);
    expect(parsed.type).toBe('income');
    expect(parsed.account).toBe('*9876');
  });

  it('parses transfer SMS correctly', () => {
    const text = 'Transfer of $150.00 sent to John Doe on 2026-09-02.';
    const parsed = parseSmsText(text);

    expect(parsed.amount).toBe(150);
    expect(parsed.type).toBe('transfer');
    expect(parsed.merchant).toBe('John Doe');
  });

  it('returns empty fallback structure for blank text', () => {
    const parsed = parseSmsText('');
    expect(parsed.amount).toBeUndefined();
    expect(parsed.type).toBe('expense');
    expect(parsed.rawText).toBe('');
  });
});

describe('SmsQuickPasteModal component', () => {
  const onClose = vi.fn();
  const onApply = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render modal when isOpen is false', () => {
    render(
      <SmsQuickPasteModal
        isOpen={false}
        onClose={onClose}
        onApply={onApply}
      />
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders modal when isOpen is true', () => {
    render(
      <SmsQuickPasteModal
        isOpen={true}
        onClose={onClose}
        onApply={onApply}
      />
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Quick Paste from SMS / Alert')).toBeDefined();
    expect(
      screen.getByPlaceholderText(/e.g. Your card ending in 4321/i)
    ).toBeDefined();
  });

  it('parses text on paste or type into textarea and autofills form inputs', async () => {
    render(
      <SmsQuickPasteModal
        isOpen={true}
        onClose={onClose}
        onApply={onApply}
      />
    );

    const textarea = screen.getByPlaceholderText(
      /e.g. Your card ending in 4321/i
    );
    fireEvent.change(textarea, {
      target: {
        value: 'Paid USD 89.99 at Best Buy with card ending 1122 on 2026-09-02',
      },
    });

    const amountInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    const merchantInput = screen.getByLabelText(
      /Merchant \/ Description/i
    ) as HTMLInputElement;
    const accountInput = screen.getByLabelText(
      /Account \/ Card/i
    ) as HTMLInputElement;

    expect(amountInput.value).toBe('89.99');
    expect(merchantInput.value).toBe('Best Buy');
    expect(accountInput.value).toBe('*1122');
  });

  it('allows manual edits to extracted fields before submitting', () => {
    render(
      <SmsQuickPasteModal
        isOpen={true}
        onClose={onClose}
        onApply={onApply}
        initialText="Paid $20 at Cafe"
      />
    );

    const amountInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '25.50' } });

    const merchantInput = screen.getByLabelText(
      /Merchant \/ Description/i
    ) as HTMLInputElement;
    fireEvent.change(merchantInput, { target: { value: 'Starbucks' } });

    const applyButton = screen.getByText('Apply Transaction');
    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 25.5,
        merchant: 'Starbucks',
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button or cancel button is clicked', () => {
    render(
      <SmsQuickPasteModal
        isOpen={true}
        onClose={onClose}
        onApply={onApply}
      />
    );

    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('reads from clipboard when Paste from Clipboard button is clicked', async () => {
    const clipboardMock = {
      readText: vi.fn().mockResolvedValue('Debited $55.00 at Grocery Store'),
    };
    Object.assign(navigator, {
      clipboard: clipboardMock,
    });

    render(
      <SmsQuickPasteModal
        isOpen={true}
        onClose={onClose}
        onApply={onApply}
      />
    );

    const pasteBtn = screen.getByText('Paste from Clipboard');
    fireEvent.click(pasteBtn);

    await waitFor(() => {
      expect(clipboardMock.readText).toHaveBeenCalledTimes(1);
      const amountInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
      expect(amountInput.value).toBe('55');
    });
  });

  it('clears textarea and parsed fields when Clear button is clicked', () => {
    render(
      <SmsQuickPasteModal
        isOpen={true}
        onClose={onClose}
        onApply={onApply}
        initialText="Charged $10 at Store"
      />
    );

    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);

    const textarea = screen.getByPlaceholderText(
      /e.g. Your card ending in 4321/i
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');

    const amountInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe('');
  });
});
