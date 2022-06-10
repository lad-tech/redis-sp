export default class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(field ? `${message} in ${field}` : message);
  }
}

ValidationError.prototype.name = 'ValidationError';
