import { afterEach, expect, it, vi } from 'vitest';
import { MeshDialBudget } from '@/services/voice/mesh-dial-budget';
afterEach(() => vi.useRealTimers());

it('bounds thousands of repeated reset attempts and coalesces retry timers', () => {
  vi.useFakeTimers();
  const retry = vi.fn();
  const budget = new MeshDialBudget(retry);
  expect(budget.acquire('peer')).toBe(true);
  expect(budget.acquire('peer')).toBe(true);
  for (let i = 0; i < 1000; i++) expect(budget.acquire('peer')).toBe(false);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(1000);
  expect(retry).toHaveBeenCalledTimes(1);
  expect(budget.acquire('peer')).toBe(true);
  expect(budget.acquire('peer')).toBe(false);
  vi.advanceTimersByTime(1999);
  expect(retry).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(retry).toHaveBeenCalledTimes(2);
  budget.clear();
});

it('isolates peers, cancels leave timers and allows a fresh call', () => {
  vi.useFakeTimers();
  const retry = vi.fn();
  const budget = new MeshDialBudget(retry);
  budget.acquire('a'); budget.acquire('a'); budget.acquire('a');
  expect(budget.acquire('b')).toBe(true);
  budget.clear();
  vi.advanceTimersByTime(60_000);
  expect(retry).not.toHaveBeenCalled();
  expect(budget.acquire('a')).toBe(true);
});

it('resets the ladder after a connection survives a minute', () => {
  vi.useFakeTimers();
  const budget = new MeshDialBudget(vi.fn());
  budget.acquire('a'); budget.acquire('a');
  vi.advanceTimersByTime(60_000);
  expect(budget.acquire('a')).toBe(true);
  expect(budget.acquire('a')).toBe(true);
});
