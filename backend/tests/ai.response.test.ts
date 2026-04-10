import { describe, it, expect } from 'vitest';
import { AiReasoningService } from '../src/services/aiReasoningService';

describe('AiReasoningService response extraction', () => {
  it('extracts content from choices.message.content', () => {
    const svc = new AiReasoningService();
    const resp = { choices: [{ message: { content: 'hello world' } }] };
    const out = (svc as any).extractResponseContent(resp);
    expect(out).toBe('hello world');
  });

  it('extracts content from choices.text', () => {
    const svc = new AiReasoningService();
    const resp = { choices: [{ text: 'legacy text' }] };
    const out = (svc as any).extractResponseContent(resp);
    expect(out).toBe('legacy text');
  });

  it('extracts content from output_text', () => {
    const svc = new AiReasoningService();
    const resp = { output_text: 'some output text' };
    const out = (svc as any).extractResponseContent(resp);
    expect(out).toBe('some output text');
  });

  it('extracts nested output array content', () => {
    const svc = new AiReasoningService();
    const resp = { output: [{ content: [{ text: 'nested text' }] }] };
    const out = (svc as any).extractResponseContent(resp);
    expect(out).toContain('nested text');
  });

  it('falls back to stringifying response when nothing else matches', () => {
    const svc = new AiReasoningService();
    const resp = { unexpected: 'value' };
    const out = (svc as any).extractResponseContent(resp);
    expect(typeof out).toBe('string');
    expect(out).toContain('unexpected');
  });
});
