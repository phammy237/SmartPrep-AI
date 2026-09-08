import { normalizeTextractExpense, parseMoney, parseNumber, parseReceiptDate } from '../normalize';

// A realistic (trimmed) AWS Textract AnalyzeExpense response shape.
function summaryField(type: string, text: string) {
  return { Type: { Text: type }, ValueDetection: { Text: text, Confidence: 99 } };
}
function lineField(type: string, text: string, confidence = 95) {
  return { Type: { Text: type, Confidence: 99 }, ValueDetection: { Text: text, Confidence: confidence } };
}
function lineItem(fields: object[]) {
  return { LineItemExpenseFields: fields };
}

const FULL = {
  ExpenseDocuments: [
    {
      SummaryFields: [
        summaryField('VENDOR_NAME', 'KROGER'),
        summaryField('INVOICE_RECEIPT_DATE', '09/05/2026'),
        summaryField('SUBTOTAL', '$12.40'),
        summaryField('TAX', '$0.93'),
        summaryField('TOTAL', '$13.33'),
      ],
      LineItemGroups: [
        {
          LineItems: [
            lineItem([
              lineField('ITEM', 'BANANAS'),
              lineField('QUANTITY', '2.14 LB'),
              lineField('PRICE', '1.47'),
              lineField('EXPENSE_ROW', 'BANANAS 2.14 LB @ 0.69 /LB    1.47 F'),
            ]),
            lineItem([
              lineField('ITEM', 'GV WHT BREAD'),
              lineField('PRICE', '1.28'),
              lineField('EXPENSE_ROW', 'GV WHT BREAD    1.28 F'),
            ]),
            lineItem([
              lineField('ITEM', '2% GAL MILK'),
              lineField('UNIT_PRICE', '3.99'),
              lineField('QUANTITY', '2'),
              lineField('PRICE', '7.98'),
              lineField('PRODUCT_CODE', '007874201234'),
              lineField('EXPENSE_ROW', '2% GAL MILK 2 @ 3.99    7.98 F'),
            ]),
          ],
        },
      ],
    },
  ],
};

describe('normalizeTextractExpense', () => {
  it('maps a full grocery receipt: merchant, date, money summary, line items', () => {
    const out = normalizeTextractExpense(FULL);
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    const r = out.result;

    expect(r.source).toBe('aws_textract');
    expect(r.merchantName).toBe('KROGER');
    expect(r.receiptDate).toBe('2026-09-05');
    expect(r.subtotal).toBe(12.4);
    expect(r.tax).toBe(0.93);
    expect(r.total).toBe(13.33);

    expect(r.lines).toHaveLength(3);
    expect(r.lines[0]).toMatchObject({
      id: '0',
      itemText: 'BANANAS',
      rawText: 'BANANAS 2.14 LB @ 0.69 /LB    1.47 F',
      quantity: 2.14,
      unitText: 'LB',
      lineTotal: 1.47,
      providerMarkedItem: true,
      confidence: 95,
    });
    expect(r.lines[2]).toMatchObject({ itemText: '2% GAL MILK', quantity: 2, unitPrice: 3.99, productCode: '007874201234' });
  });

  it('falls back to EXPENSE_ROW text when there is no ITEM field', () => {
    const out = normalizeTextractExpense({
      ExpenseDocuments: [{ SummaryFields: [], LineItemGroups: [{ LineItems: [lineItem([lineField('EXPENSE_ROW', 'MYSTERY LINE 3.00')])] }] }],
    });
    if (out.status !== 'ok') throw new Error('expected ok');
    expect(out.result.lines[0]).toMatchObject({ rawText: 'MYSTERY LINE 3.00', itemText: undefined, providerMarkedItem: false });
  });

  it('missing quantity / price / date degrade to undefined (never fabricated)', () => {
    const out = normalizeTextractExpense({
      ExpenseDocuments: [
        {
          SummaryFields: [summaryField('VENDOR_NAME', 'CORNER STORE')],
          LineItemGroups: [{ LineItems: [lineItem([lineField('ITEM', 'GUM')])] }],
        },
      ],
    });
    if (out.status !== 'ok') throw new Error('expected ok');
    expect(out.result.receiptDate).toBeUndefined();
    expect(out.result.total).toBeUndefined();
    expect(out.result.lines[0]).toMatchObject({ itemText: 'GUM', quantity: undefined, lineTotal: undefined });
  });

  it('duplicated fields of the same type: the first wins', () => {
    const out = normalizeTextractExpense({
      ExpenseDocuments: [
        {
          SummaryFields: [],
          LineItemGroups: [{ LineItems: [lineItem([lineField('ITEM', 'APPLE'), lineField('ITEM', 'WRONG')])] }],
        },
      ],
    });
    if (out.status !== 'ok') throw new Error('expected ok');
    expect(out.result.lines[0].itemText).toBe('APPLE');
  });

  it('a receipt with no line items -> no_line_items (still returns the summary)', () => {
    const out = normalizeTextractExpense({
      ExpenseDocuments: [{ SummaryFields: [summaryField('VENDOR_NAME', 'ATM')], LineItemGroups: [] }],
    });
    expect(out.status).toBe('no_line_items');
    if (out.status === 'no_line_items') expect(out.result.merchantName).toBe('ATM');
  });

  it('a malformed response -> malformed', () => {
    expect(normalizeTextractExpense(null).status).toBe('malformed');
    expect(normalizeTextractExpense({}).status).toBe('malformed');
    expect(normalizeTextractExpense({ ExpenseDocuments: 'nope' }).status).toBe('malformed');
  });

  it('a low-confidence line still comes through, with its confidence attached', () => {
    const out = normalizeTextractExpense({
      ExpenseDocuments: [
        { SummaryFields: [], LineItemGroups: [{ LineItems: [lineItem([lineField('ITEM', 'BLURRY THING', 41)])] }] },
      ],
    });
    if (out.status !== 'ok') throw new Error('expected ok');
    expect(out.result.lines[0].confidence).toBe(41);
  });
});

describe('parseMoney / parseNumber / parseReceiptDate', () => {
  it('parseMoney handles $, commas, parens/negatives', () => {
    expect(parseMoney('$1,234.56')).toBe(1234.56);
    expect(parseMoney('12.40')).toBe(12.4);
    expect(parseMoney('(1.23)')).toBe(-1.23);
    expect(parseMoney('-0.50')).toBe(-0.5);
    expect(parseMoney('')).toBeUndefined();
    expect(parseMoney('abc')).toBeUndefined();
  });

  it('parseNumber extracts a positive quantity', () => {
    expect(parseNumber('2.14 LB')).toBe(2.14);
    expect(parseNumber('3')).toBe(3);
    expect(parseNumber('0')).toBeUndefined();
    expect(parseNumber('x')).toBeUndefined();
  });

  it('parseReceiptDate normalizes common formats to ISO', () => {
    expect(parseReceiptDate('09/05/2026')).toBe('2026-09-05');
    expect(parseReceiptDate('9-5-26')).toBe('2026-09-05');
    expect(parseReceiptDate('2026-09-05')).toBe('2026-09-05');
    expect(parseReceiptDate('Sep 5, 2026')).toBe('2026-09-05');
    expect(parseReceiptDate('not a date')).toBeUndefined();
  });
});
