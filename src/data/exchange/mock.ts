import type { AlertSnapshot, DataExchange, DispatchSnapshot, EpidemicSnapshot, OverviewSnapshot, PolicySnapshot, Provider } from '../types';
import overview from '../mock/overview.json';
import policy from '../mock/policy.json';
import dispatch from '../mock/dispatch.json';
import epidemic from '../mock/epidemic.json';
import alert from '../mock/alert.json';

export function mockProvider<T>(data: T): Provider<T> {
  return {
    source: 'mock',
    snapshot: async () => structuredClone(data),
  };
}

export function createMockExchange(): Omit<DataExchange, 'carbon' | 'twin'> {
  return {
    overview: mockProvider(overview as OverviewSnapshot),
    policy: mockProvider(policy as PolicySnapshot),
    dispatch: mockProvider(dispatch as DispatchSnapshot),
    epidemic: mockProvider(epidemic as EpidemicSnapshot),
    alert: mockProvider(alert as AlertSnapshot),
  };
}
