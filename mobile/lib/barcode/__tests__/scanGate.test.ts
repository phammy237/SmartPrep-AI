import { createScanGate } from '../scanGate';

describe('createScanGate - camera duplicate suppression', () => {
  it('claims the first sighting of a barcode', () => {
    const gate = createScanGate();
    expect(gate.claim('036000291452')).toBe(true);
  });

  it('ignores rapid repeat fires while a lookup is in flight', () => {
    const gate = createScanGate();
    expect(gate.claim('036000291452')).toBe(true);
    expect(gate.claim('036000291452')).toBe(false);
    expect(gate.claim('036000291452')).toBe(false);
  });

  it('still ignores the same barcode right after release (no double lookup on one physical scan)', () => {
    const gate = createScanGate();
    gate.claim('036000291452');
    gate.release();
    expect(gate.claim('036000291452')).toBe(false);
  });

  it('lets a DIFFERENT barcode through after release', () => {
    const gate = createScanGate();
    gate.claim('036000291452');
    gate.release();
    expect(gate.claim('3017620422003')).toBe(true);
  });

  it('reset() allows an intentional re-scan of the same barcode ("Scan again")', () => {
    const gate = createScanGate();
    gate.claim('036000291452');
    gate.release();
    gate.reset();
    expect(gate.claim('036000291452')).toBe(true);
  });

  it('a second claim while locked does not overwrite the remembered barcode', () => {
    const gate = createScanGate();
    gate.claim('036000291452'); // locked, remembers A
    expect(gate.claim('3017620422003')).toBe(false); // locked
    gate.release();
    expect(gate.claim('3017620422003')).toBe(true); // B is new -> allowed
  });
});
