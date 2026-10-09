import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

function loader() {
  const page = new JSDOM('', { runScripts: 'outside-only' });
  const state = { cycle: { id: 'old' }, data: null as unknown };
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  const hydrate = vi.fn();
  Object.assign(page.window, {
    A: state, currentCycleId: () => state.cycle.id, can: () => true, hydrateState: hydrate,
    api: (url: string) => new Promise((resolve, reject) => pending.set(url, { resolve, reject })),
  });
  const source = readFileSync('public/full-services.js', 'utf8');
  page.window.eval(source.slice(source.indexOf('  var cycleLoadVersion=0;'), source.indexOf('  function hydrateState()')));
  const load = () => (page.window as unknown as { loadCycleData(): Promise<boolean> }).loadCycleData();
  function complete(id: string) {
    pending.get('/api/app/exclusions?cycle_id=' + id)!.resolve({ exclusions: [] });
    pending.get('/api/app/attendance?cycle_id=' + id)!.resolve({ attendance: [], entries: [] });
    pending.get('/api/app/bootstrap?cycle_id=' + id)!.resolve({ cycles: [{ id }] });
  }
  return { page, state, pending, hydrate, load, complete };
}

describe('cycle loading consistency', () => {
  it('ignores an older response that arrives after the new selection', async () => {
    const { page, state, load, complete, hydrate } = loader();
    const old = load();
    state.cycle = { id: 'new' };
    const latest = load();
    complete('new');
    expect(await latest).toBe(true);
    complete('old');
    expect(await old).toBe(false);
    expect(state.cycle.id).toBe('new');
    expect(hydrate).toHaveBeenCalledOnce();
    page.window.close();
  });
  it('does not present failed attendance loading as an empty attendance record', async () => {
    const { page, state, load, pending, hydrate } = loader();
    const request = load();
    pending.get('/api/app/attendance?cycle_id=old')!.reject(new Error('network failed'));
    await expect(request).rejects.toThrow('network failed');
    expect(state.data).toBeNull();
    expect(hydrate).not.toHaveBeenCalled();
    page.window.close();
  });
});
