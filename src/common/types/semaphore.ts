export interface Semaphore {
  acquire(options?: { [option: string]: unknown }): Promise<void>;

  release(): Promise<void>;

  tryToAcquire(): Promise<boolean>;
}
