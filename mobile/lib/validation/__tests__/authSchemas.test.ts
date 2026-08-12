import { emailSchema, passwordSchema, signInSchema, signUpSchema } from '../authSchemas';

describe('emailSchema', () => {
  it('accepts a valid email and lowercases/trims it', () => {
    expect(emailSchema.parse(' Test@Example.com ')).toBe('test@example.com');
  });

  it('rejects a malformed email', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a password meeting all rules', () => {
    expect(passwordSchema.safeParse('Abcdef12').success).toBe(true);
  });

  it('rejects a password under 8 characters', () => {
    expect(passwordSchema.safeParse('Abc123').success).toBe(false);
  });

  it('rejects a password with no uppercase letter', () => {
    expect(passwordSchema.safeParse('abcdef12').success).toBe(false);
  });

  it('rejects a password with no lowercase letter', () => {
    expect(passwordSchema.safeParse('ABCDEF12').success).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(passwordSchema.safeParse('Abcdefgh').success).toBe(false);
  });

  it('rejects a password over 72 characters', () => {
    expect(passwordSchema.safeParse('Aa1' + 'a'.repeat(70)).success).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('accepts a fully valid payload', () => {
    const result = signUpSchema.safeParse({ displayName: 'Jamie', email: 'jamie@example.com', password: 'Abcdef12' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty display name', () => {
    const result = signUpSchema.safeParse({ displayName: '  ', email: 'jamie@example.com', password: 'Abcdef12' });
    expect(result.success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('does not enforce password complexity on sign-in (only presence)', () => {
    const result = signInSchema.safeParse({ email: 'jamie@example.com', password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing password', () => {
    const result = signInSchema.safeParse({ email: 'jamie@example.com', password: '' });
    expect(result.success).toBe(false);
  });
});
