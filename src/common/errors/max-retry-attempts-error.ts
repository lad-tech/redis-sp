export default class MaxRetryAttemptsError extends Error {
  constructor(message: string, public readonly totalRetryAttempts: number) {
    super(`${message} after ${totalRetryAttempts} retry attempt${totalRetryAttempts !== 1 ? 's' : ''}`);
  }
}

MaxRetryAttemptsError.prototype.name = 'MaxRetryAttemptsError';
