import { fetchOpenFoodFactsProduct } from '../openFoodFacts';
import { lookupProduct } from '../repository';

jest.mock('../openFoodFacts', () => ({
  ...jest.requireActual('../openFoodFacts'),
  fetchOpenFoodFactsProduct: jest.fn(),
}));

const fetchOff = fetchOpenFoodFactsProduct as jest.Mock;

beforeEach(() => fetchOff.mockReset());

describe('lookupProduct - variant retry + precedence', () => {
  it('returns the first hit and never calls a later variant', async () => {
    fetchOff.mockResolvedValueOnce({ status: 'found', product: { barcode: '036000291452' } });
    const result = await lookupProduct('036000291452');
    expect(result.status).toBe('found');
    expect(fetchOff).toHaveBeenCalledTimes(1);
  });

  it('retries a 12-digit UPC-A as the zero-padded 13-digit GTIN, keeping the scanned barcode', async () => {
    fetchOff
      .mockResolvedValueOnce({ status: 'not_found', barcode: '036000291452' })
      .mockResolvedValueOnce({ status: 'found', product: { barcode: '036000291452', productName: 'X' } });
    const result = await lookupProduct('036000291452');
    expect(fetchOff).toHaveBeenNthCalledWith(1, '036000291452', '036000291452', {});
    expect(fetchOff).toHaveBeenNthCalledWith(2, '036000291452', '0036000291452', {});
    expect(result.status).toBe('found');
    if (result.status === 'found') expect(result.product.barcode).toBe('036000291452');
  });

  it('surfaces a hard error immediately instead of masking it with a later "not found"', async () => {
    fetchOff.mockResolvedValueOnce({ status: 'error', reason: 'offline', barcode: '036000291452' });
    const result = await lookupProduct('036000291452');
    expect(result).toEqual({ status: 'error', reason: 'offline', barcode: '036000291452' });
    expect(fetchOff).toHaveBeenCalledTimes(1);
  });

  it('returns not_found when every variant misses', async () => {
    fetchOff.mockResolvedValue({ status: 'not_found', barcode: '036000291452' });
    expect((await lookupProduct('036000291452')).status).toBe('not_found');
  });
});
