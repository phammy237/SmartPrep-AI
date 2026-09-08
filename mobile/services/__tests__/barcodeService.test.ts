import { lookupProduct } from '@/lib/barcode';
import { supabase } from '@/lib/supabase/client';
import { barcodeService } from '../barcodeService';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('@/lib/barcode', () => ({
  ...jest.requireActual('@/lib/barcode'),
  lookupProduct: jest.fn(),
}));

const getUser = supabase.auth.getUser as jest.Mock;
const lookup = lookupProduct as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  lookup.mockResolvedValue({ status: 'found', product: { barcode: '036000291452', productName: 'Soda' } });
});

describe('barcodeService.lookupBarcode', () => {
  it('requires an authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(barcodeService.lookupBarcode('036000291452')).rejects.toThrow('Not signed in');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('normalizes then looks up with the canonical value (whitespace / hyphens stripped)', async () => {
    await barcodeService.lookupBarcode('0-36000-29145-2');
    expect(lookup).toHaveBeenCalledWith('036000291452', undefined);
  });

  it('rejects an invalid barcode BEFORE any lookup (no provider call)', async () => {
    const result = await barcodeService.lookupBarcode('12345');
    expect(result).toEqual({ status: 'error', reason: 'invalid_barcode', barcode: '12345' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('a bad check digit is an invalid barcode, not a lookup miss', async () => {
    const result = await barcodeService.lookupBarcode('036000291453');
    expect(result).toEqual({ status: 'error', reason: 'invalid_barcode', barcode: '036000291453' });
  });

  it('expands a camera UPC-E before lookup (same pipeline)', async () => {
    await barcodeService.lookupBarcode('654321', { upcE: true });
    expect(lookup).toHaveBeenCalledWith('065100004327', undefined);
  });

  it('the manual-entry path is literally the same call - no second implementation', async () => {
    await barcodeService.lookupBarcode('3017620422003'); // typed
    await barcodeService.lookupBarcode('3017620422003'); // "scanned"
    expect(lookup).toHaveBeenNthCalledWith(1, '3017620422003', undefined);
    expect(lookup).toHaveBeenNthCalledWith(2, '3017620422003', undefined);
  });

  it('passes provider results (not_found / error) straight through', async () => {
    lookup.mockResolvedValue({ status: 'not_found', barcode: '3017620422003' });
    expect((await barcodeService.lookupBarcode('3017620422003')).status).toBe('not_found');

    lookup.mockResolvedValue({ status: 'error', reason: 'provider_unavailable', barcode: '3017620422003' });
    expect(await barcodeService.lookupBarcode('3017620422003')).toEqual({
      status: 'error',
      reason: 'provider_unavailable',
      barcode: '3017620422003',
    });
  });
});
