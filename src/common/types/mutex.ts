export interface Mutex {
  lock(options?: { [option: string]: unknown }): Promise<void>;

  tryToLock(): Promise<boolean>;

  unlock(): Promise<void>;
}
