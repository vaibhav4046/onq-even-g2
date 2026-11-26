import { EventEmitter } from 'node:events';

/** Stand-in for a child process: tests drive stdout / stderr / close by hand. Nothing real is ever started. */
export class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  constructor(public pid = 4242) {
    super();
  }
  kill(): boolean {
    this.killed = true;
    return true;
  }
}
