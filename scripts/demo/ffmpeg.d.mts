export interface Ramp { from: number; to: number; factor: number }
export function buildConvertArgs(opts: {
  input: string; output: string; trimStartSec?: number; ramps?: Ramp[];
}): string[];
export function buildStillArgs(input: string, output: string): string[];
