export interface CheckResult { name: string; ok: boolean; detail?: string }
export function checkFields(obj: unknown, spec: Record<string, string>): string[];
export function summarize(results: CheckResult[]): { passed: number; failed: number; exitCode: number };
export function formatResults(results: CheckResult[]): string;
export function fetchJson(url: string, init?: RequestInit, timeoutMs?: number): Promise<any>;
