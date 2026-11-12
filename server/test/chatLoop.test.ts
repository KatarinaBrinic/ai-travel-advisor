import { describe, expect, it } from 'vitest';
import { runTurn, VISA_UNAVAILABLE_MESSAGE } from '../src/llm/chatLoop.ts';
import type { OpenAIResponsesClient } from '../src/llm/openaiClient.ts';

function clientReturning(...responses: Array<{ output_text?: string; output?: unknown[] }>) {
  let i = 0;
  const calls: Array<{ model: string; instructions: string; input: unknown[]; tools?: unknown[] }> = [];
  const client: OpenAIResponsesClient = {
    responses: {
      create: async (params) => {
        calls.push(params);
        const response = responses[Math.min(i, responses.length - 1)];
        i++;
        return response;
      },
    },
  };
  return { client, calls };
}

describe('runTurn — plain replies', () => {
  it('returns the model text with no tool calls when none are made', async () => {
    const { client, calls } = clientReturning({ output_text: 'Hello traveler!' });

    const result = await runTurn({
      client,
      model: 'gpt-4o-mini',
      instructions: 'You are a travel advisor.',
      history: [{ role: 'user', content: 'Hi' }],
    });

    expect(result).toEqual({ text: 'Hello traveler!', toolCalls: [] });
    expect(calls[0]).toMatchObject({
      model: 'gpt-4o-mini',
      instructions: 'You are a travel advisor.',
      input: [{ role: 'user', content: 'Hi' }],
    });
  });

  it('falls back to parsing output items when output_text is absent', async () => {
    const { client } = clientReturning({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Parsed reply' }] }],
    });

    const result = await runTurn({ client, model: 'gpt-4o-mini', instructions: 'x', history: [] });
    expect(result.text).toBe('Parsed reply');
  });

  it('returns an empty string when the response has no text at all', async () => {
    const { client } = clientReturning({});
    const result = await runTurn({ client, model: 'gpt-4o-mini', instructions: 'x', history: [] });
    expect(result.text).toBe('');
  });

  it('propagates errors from the client instead of swallowing them', async () => {
    const client: OpenAIResponsesClient = {
      responses: {
        create: async () => {
          throw new Error('upstream failure');
        },
      },
    };

    await expect(
      runTurn({ client, model: 'gpt-4o-mini', instructions: 'x', history: [] }),
    ).rejects.toThrow('upstream failure');
  });
});

describe('runTurn — tool calls', () => {
  it('executes a requested tool and feeds its result back to the model', async () => {
    const { client, calls } = clientReturning(
      {
        output: [
          {
            type: 'function_call',
            call_id: 'call_1',
            name: 'get_weather',
            arguments: JSON.stringify({ location: 'Paris' }),
          },
        ],
      },
      { output_text: 'It is sunny in Paris.' },
    );

    const executeTool = async (name: string, args: unknown) => {
      expect(name).toBe('get_weather');
      expect(args).toEqual({ location: 'Paris' });
      return { temperatureC: 22, condition: 'clear' };
    };

    const result = await runTurn({
      client,
      model: 'gpt-4o-mini',
      instructions: 'x',
      history: [{ role: 'user', content: 'Weather in Paris?' }],
      executeTool,
    });

    expect(result.text).toBe('It is sunny in Paris.');
    expect(result.toolCalls).toEqual([
      { name: 'get_weather', arguments: { location: 'Paris' }, result: { temperatureC: 22, condition: 'clear' } },
    ]);

    const secondCallInput = calls[1].input;
    expect(secondCallInput).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'function_call', call_id: 'call_1' }),
        expect.objectContaining({ type: 'function_call_output', call_id: 'call_1' }),
      ]),
    );
  });

  it('handles multiple tool calls requested in a single round', async () => {
    const { client } = clientReturning(
      {
        output: [
          { type: 'function_call', call_id: 'a', name: 'get_weather', arguments: '{"location":"Rome"}' },
          { type: 'function_call', call_id: 'b', name: 'get_exchange_rate', arguments: '{"base":"USD","target":"EUR"}' },
        ],
      },
      { output_text: 'Here is what I found.' },
    );

    const seen: string[] = [];
    const executeTool = async (name: string) => {
      seen.push(name);
      return { ok: true };
    };

    const result = await runTurn({ client, model: 'gpt-4o-mini', instructions: 'x', history: [], executeTool });

    expect(seen.sort()).toEqual(['get_exchange_rate', 'get_weather']);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.text).toBe('Here is what I found.');
  });

  it('gives the model a structured error for invalid JSON arguments, without calling the executor', async () => {
    const { client } = clientReturning(
      { output: [{ type: 'function_call', call_id: 'x', name: 'get_weather', arguments: '{not json' }] },
      { output_text: 'Sorted it out.' },
    );

    let executed = false;
    const executeTool = async () => {
      executed = true;
      return {};
    };

    const result = await runTurn({ client, model: 'm', instructions: 'x', history: [], executeTool });

    expect(executed).toBe(false);
    expect(result.toolCalls[0].result).toMatchObject({ error: expect.stringContaining('Invalid JSON') });
  });

  it('surfaces a tool execution failure as a structured result rather than throwing', async () => {
    const { client } = clientReturning(
      { output: [{ type: 'function_call', call_id: 'x', name: 'get_weather', arguments: '{}' }] },
      { output_text: 'Could not check the weather.' },
    );

    const executeTool = async () => ({ error: 'timed out' });
    const result = await runTurn({ client, model: 'm', instructions: 'x', history: [], executeTool });

    expect(result.toolCalls[0].result).toEqual({ error: 'timed out' });
    expect(result.text).toBe('Could not check the weather.');
  });

  it('stops after the iteration cap and returns a fallback message', async () => {
    const alwaysCallsTool = {
      output: [{ type: 'function_call', call_id: 'x', name: 'get_weather', arguments: '{}' }],
    };
    const { client, calls } = clientReturning(
      alwaysCallsTool,
      alwaysCallsTool,
      alwaysCallsTool,
      alwaysCallsTool,
      alwaysCallsTool,
    );

    const executeTool = async () => ({ ok: true });
    const result = await runTurn({ client, model: 'm', instructions: 'x', history: [], executeTool });

    expect(calls).toHaveLength(4);
    expect(result.text).toMatch(/wasn't able to finish/i);
  });
});

describe('runTurn — visa/immigration flag short-circuit', () => {
  it('returns the fixed unavailability message and never asks the model for a follow-up', async () => {
    const { client, calls } = clientReturning(
      {
        output: [
          { type: 'function_call', call_id: 'v1', name: 'flag_visa_immigration_question', arguments: '{}' },
        ],
      },
      // If the loop incorrectly continued, this second canned response
      // would be what a model-composed (potentially stale) answer looks like.
      { output_text: 'Yes, US citizens can enter Japan visa-free for 90 days.' },
    );

    const result = await runTurn({ client, model: 'm', instructions: 'x', history: [] });

    expect(result.text).toBe(VISA_UNAVAILABLE_MESSAGE);
    expect(result.text).not.toContain('visa-free');
    expect(calls).toHaveLength(1);
    expect(result.toolCalls).toEqual([
      { name: 'flag_visa_immigration_question', arguments: {}, result: { unavailable: true } },
    ]);
  });

  it('discards other tool calls requested in the same batch rather than partially answering', async () => {
    const { client, calls } = clientReturning({
      output: [
        { type: 'function_call', call_id: 'w1', name: 'get_weather', arguments: '{"location":"Tokyo"}' },
        { type: 'function_call', call_id: 'v1', name: 'flag_visa_immigration_question', arguments: '{}' },
      ],
    });

    let weatherExecuted = false;
    const executeTool = async (name: string) => {
      if (name === 'get_weather') weatherExecuted = true;
      return { ok: true };
    };

    const result = await runTurn({ client, model: 'm', instructions: 'x', history: [], executeTool });

    expect(calls).toHaveLength(1);
    expect(weatherExecuted).toBe(false);
    expect(result.text).toBe(VISA_UNAVAILABLE_MESSAGE);
    expect(result.toolCalls).toEqual([
      { name: 'get_weather', arguments: { location: 'Tokyo' }, result: { skipped: true, reason: expect.any(String) } },
      { name: 'flag_visa_immigration_question', arguments: {}, result: { unavailable: true } },
    ]);
  });
});
