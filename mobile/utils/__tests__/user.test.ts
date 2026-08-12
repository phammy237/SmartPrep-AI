import { initialsFromName } from '../user';

describe('initialsFromName', () => {
  it('takes first+last initials for a full name', () => {
    expect(initialsFromName('Jamie Lee')).toBe('JL');
  });

  it('takes a single initial for a single word', () => {
    expect(initialsFromName('jamie')).toBe('J');
  });

  it('ignores extra whitespace', () => {
    expect(initialsFromName('  Jamie   Lee  ')).toBe('JL');
  });

  it('uses first+last for 3+ word names', () => {
    expect(initialsFromName('Jamie Ann Lee')).toBe('JL');
  });

  it('falls back to "?" for an empty name', () => {
    expect(initialsFromName('')).toBe('?');
    expect(initialsFromName('   ')).toBe('?');
  });
});
