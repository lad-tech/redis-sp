import crypto from 'crypto';

export function createSHA1Hash(input: string) {
  return crypto.createHash('sha1').update(input, 'utf8').digest('hex');
}

export function generateId() {
  return crypto.randomBytes(16).toString('hex');
}
