import type { OpenAIResponsesClient } from './openaiClient.ts';
import {
  executeTool as defaultExecuteTool,
  toolDefinitions as defaultToolDefinitions,
  VISA_FLAG_TOOL_NAME,
} from './tools/index.ts';

export const VISA_UNAVAILABLE_MESSAGE =
  "Live visa verification isn't available right now, so I can't reliably confirm current visa or " +
  'entry requirements for that. Please check the destination\'s official government/embassy ' +
  'website, or a licensed visa service, before you travel.';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolCallSummary {
  name: string;
  arguments: unknown;
  result: unknown;
}

export interface RunTurnResult {
  text: string;
  toolCalls: ToolCallSummary[];
}

export interface RunTurnParams {
  client: OpenAIResponsesClient;
  model: string;
  instructions: string;
  history: ChatMessage[];
  tools?: unknown[];
  executeTool?: (name: string, args: unknown) => Promise<unknown>;
}

const MAX_TOOL_ITERATIONS = 4;

interface FunctionCallItem {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

export async function runTurn({
  client,
  model,
  instructions,
  history,
  tools = defaultToolDefinitions,
  executeTool = defaultExecuteTool,
}: RunTurnParams): Promise<RunTurnResult> {
  let input: unknown[] = history.map((m) => ({ role: m.role, content: m.content }));
  const toolCalls: ToolCallSummary[] = [];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.responses.create({ model, instructions, input, tools });
    const functionCalls = extractFunctionCalls(response);

    if (functionCalls.length === 0) {
      return { text: extractText(response), toolCalls };
    }

    // Hard guarantee, not a prompt nudge: if the model recognizes a
    // visa/entry/immigration question, the turn ends here with a fixed,
    // backend-authored message. The model never gets a chance to produce
    // or continue to its own answer for this turn, even if other tools
    // were also requested in the same batch — those are recorded as
    // skipped rather than executed, since mixing a real result with a
    // hard refusal in one turn isn't worth the added complexity.
    const visaFlagCall = functionCalls.find((call) => call.name === VISA_FLAG_TOOL_NAME);
    if (visaFlagCall) {
      for (const call of functionCalls) {
        toolCalls.push({
          name: call.name,
          arguments: safeParseArgs(call.arguments),
          result:
            call.name === VISA_FLAG_TOOL_NAME
              ? { unavailable: true }
              : { skipped: true, reason: 'Turn ended by visa/immigration flag' },
        });
      }
      return { text: VISA_UNAVAILABLE_MESSAGE, toolCalls };
    }

    const functionCallOutputs: unknown[] = [];
    for (const call of functionCalls) {
      let parsedArgs: unknown;
      let result: unknown;
      try {
        parsedArgs = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        result = { error: `Invalid JSON arguments for tool "${call.name}"` };
      }
      if (result === undefined) {
        result = await executeTool(call.name, parsedArgs);
      }
      toolCalls.push({ name: call.name, arguments: parsedArgs, result });
      functionCallOutputs.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }

    input = [...input, ...((response.output ?? []) as unknown[]), ...functionCallOutputs];
  }

  console.warn(`Tool loop hit the ${MAX_TOOL_ITERATIONS}-iteration cap without a final response.`);
  return {
    text: "I wasn't able to finish checking that after a few tries — could you rephrase your question?",
    toolCalls,
  };
}

function safeParseArgs(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { error: 'Invalid JSON arguments' };
  }
}

function extractFunctionCalls(response: { output?: unknown[] }): FunctionCallItem[] {
  const output = response.output ?? [];
  const result: FunctionCallItem[] = [];
  for (const item of output) {
    if (
      typeof item === 'object' &&
      item !== null &&
      (item as { type?: unknown }).type === 'function_call' &&
      typeof (item as { call_id?: unknown }).call_id === 'string' &&
      typeof (item as { name?: unknown }).name === 'string' &&
      typeof (item as { arguments?: unknown }).arguments === 'string'
    ) {
      result.push(item as unknown as FunctionCallItem);
    }
  }
  return result;
}

function extractText(response: { output_text?: string; output?: unknown[] }): string {
  if (typeof response.output_text === 'string') {
    return response.output_text;
  }
  const output = (response.output ?? []) as Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  return output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
}
