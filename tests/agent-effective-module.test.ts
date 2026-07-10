import { describe, expect, it } from 'vitest';
import { effectiveModule } from '../src/screens/agent/tools';

describe('effectiveModule', () => {
  it('get_module_data + args.module 在六模組內 → 補該模組（live 態 tool_call 無靜態 module 的修復）', () => {
    expect(effectiveModule('get_module_data', { module: 'carbon' }, undefined)).toBe('carbon');
  });

  it('有靜態 module 的工具（如 ask_policy_rag）→ 用靜態值，不看 args', () => {
    expect(effectiveModule('ask_policy_rag', { question: 'x' }, 'policy')).toBe('policy');
  });

  it('無靜態 module 且非 get_module_data（如 navigate_to_screen）→ undefined', () => {
    expect(effectiveModule('navigate_to_screen', { id: 'carbon' }, undefined)).toBeUndefined();
  });

  it('get_module_data 但 args.module 不在六模組內 → undefined（不信任未知值）', () => {
    expect(effectiveModule('get_module_data', { module: 'evil' }, undefined)).toBeUndefined();
  });

  it('get_module_data 缺 args.module → undefined', () => {
    expect(effectiveModule('get_module_data', {}, undefined)).toBeUndefined();
  });
});
