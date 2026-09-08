/**
 * Pure normalizer for AWS Textract `AnalyzeExpense` responses. NO Deno /
 * network / env access here so it unit-tests with the app's normal jest setup
 * (see __tests__/normalize.test.ts). index.ts (the Edge Function) does the auth
 * check, the SigV4 call, and delegates all shape work here.
 *
 * Output is the provider-neutral `ReceiptOcrResult` - mirrored BY HAND in
 * mobile/types/receipt.ts. Raw Textract shapes (ExpenseDocuments, SummaryFields,
 * LineItemExpenseFields, Type.Text enums, ...) never leave this file.
 */

export type ReceiptOcrSource = 'aws_textract';

export interface ReceiptRawLine {
  id: string;
  rawText: string;
  itemText?: string;
  quantity?: number;
  unitText?: string;
  unitPrice?: number;
  lineTotal?: number;
  productCode?: string;
  confidence?: number;
  providerMarkedItem: boolean;
}

export interface ReceiptOcrResult {
  source: ReceiptOcrSource;
  merchantName?: string;
  receiptDate?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  lines: ReceiptRawLine[];
}

export type NormalizedReceipt =
  | { status: 'ok'; result: ReceiptOcrResult }
  | { status: 'no_line_items'; result: ReceiptOcrResult }
  | { status: 'malformed' };

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

/** "$1,234.56", "-1.23", "(1.23)", "1.234,56" (some locales) -> number | undefined. */
export function parseMoney(raw: unknown): number | undefined {
  let s = str(raw).trim();
  if (s.length === 0) return undefined;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[()\s$£€]/g, '').replace(/^-/, '');
  // If there's a comma AND a dot, assume comma = thousands. If only comma with 2 trailing digits, treat as decimal.
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -n : n;
}

/** Bare numeric parse (quantities): "2.14", "3" -> number | undefined (>0). */
export function parseNumber(raw: unknown): number | undefined {
  const m = str(raw).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** MM/DD/YYYY, M-D-YY, YYYY-MM-DD, "Jan 3 2026" -> ISO YYYY-MM-DD | undefined. */
export function parseReceiptDate(raw: unknown): string | undefined {
  const s = str(raw).trim();
  if (!s) return undefined;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }

  m = s.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[2].padStart(2, '0')}`;
  }
  return undefined;
}

const UNIT_IN_TEXT = /(\d+(?:\.\d+)?)\s*(lb|lbs|oz|kg|kgs|g|gram|grams|ml|l|liter|liters|ea|each|ct|pk)\b/i;

function extractUnitToken(...texts: (string | undefined)[]): string | undefined {
  for (const t of texts) {
    const m = (t ?? '').match(UNIT_IN_TEXT);
    if (m) return m[2];
  }
  return undefined;
}

interface ExpenseFieldLike {
  Type?: { Text?: string; Confidence?: number };
  ValueDetection?: { Text?: string; Confidence?: number };
}

function fieldMap(fields: unknown): Map<string, ExpenseFieldLike> {
  const out = new Map<string, ExpenseFieldLike>();
  if (!Array.isArray(fields)) return out;
  for (const f of fields) {
    if (!f || typeof f !== 'object') continue;
    const ef = f as ExpenseFieldLike;
    const key = ef.Type?.Text;
    if (typeof key === 'string' && !out.has(key)) out.set(key, ef); // first wins on duplicates
  }
  return out;
}

function val(f: ExpenseFieldLike | undefined): string {
  return str(f?.ValueDetection?.Text).trim();
}

/** Normalize a full Textract AnalyzeExpense response. */
export function normalizeTextractExpense(raw: unknown): NormalizedReceipt {
  if (!raw || typeof raw !== 'object') return { status: 'malformed' };
  const docs = (raw as Record<string, unknown>).ExpenseDocuments;
  if (!Array.isArray(docs)) return { status: 'malformed' };

  const doc = (docs[0] ?? {}) as Record<string, unknown>;
  const summary = fieldMap(doc.SummaryFields);

  const result: ReceiptOcrResult = {
    source: 'aws_textract',
    merchantName: val(summary.get('VENDOR_NAME')) || undefined,
    receiptDate: parseReceiptDate(val(summary.get('INVOICE_RECEIPT_DATE'))),
    subtotal: parseMoney(val(summary.get('SUBTOTAL'))),
    tax: parseMoney(val(summary.get('TAX'))),
    total: parseMoney(val(summary.get('TOTAL')) || val(summary.get('AMOUNT_PAID'))),
    lines: [],
  };

  const groups = Array.isArray(doc.LineItemGroups) ? doc.LineItemGroups : [];
  let idx = 0;
  for (const group of groups) {
    const items = Array.isArray((group as Record<string, unknown>)?.LineItems)
      ? ((group as Record<string, unknown>).LineItems as unknown[])
      : [];
    for (const li of items) {
      const fm = fieldMap((li as Record<string, unknown>)?.LineItemExpenseFields);
      const itemF = fm.get('ITEM');
      const rowF = fm.get('EXPENSE_ROW');
      const qtyF = fm.get('QUANTITY');
      const itemText = val(itemF);
      const rawText = val(rowF) || itemText;
      if (rawText.length === 0 && itemText.length === 0) continue;

      const unitText = extractUnitToken(val(qtyF), itemText, rawText);
      const line: ReceiptRawLine = {
        id: String(idx),
        rawText: rawText || itemText,
        itemText: itemText || undefined,
        quantity: parseNumber(val(qtyF)),
        unitText,
        unitPrice: parseMoney(val(fm.get('UNIT_PRICE'))),
        lineTotal: parseMoney(val(fm.get('PRICE'))),
        productCode: val(fm.get('PRODUCT_CODE')) || undefined,
        confidence:
          itemF?.ValueDetection?.Confidence ??
          rowF?.ValueDetection?.Confidence ??
          undefined,
        providerMarkedItem: itemText.length > 0,
      };
      result.lines.push(line);
      idx += 1;
    }
  }

  if (result.lines.length === 0) return { status: 'no_line_items', result };
  return { status: 'ok', result };
}
