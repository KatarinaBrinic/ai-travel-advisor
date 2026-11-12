import type { PrismaClient } from '@prisma/client';
import { createFlagVisaQuestionTool } from './flagVisaQuestion.ts';
import { createGetExchangeRateTool } from './getExchangeRate.ts';
import { createGetWeatherTool } from './getWeather.ts';
import { createRememberFactTool, rememberFactDefinition } from './rememberFact.ts';
import { createUpdateTripPlanTool, updateTripPlanDefinition } from './updateTripPlan.ts';

const getExchangeRateTool = createGetExchangeRateTool();
const getWeatherTool = createGetWeatherTool();
const flagVisaQuestionTool = createFlagVisaQuestionTool();

export const VISA_FLAG_TOOL_NAME = flagVisaQuestionTool.definition.name;

export const toolDefinitions = [
  getExchangeRateTool.definition,
  getWeatherTool.definition,
  flagVisaQuestionTool.definition,
  updateTripPlanDefinition,
  rememberFactDefinition,
];

type SingleToolExecutor = (args: unknown) => Promise<unknown>;
type ExecuteToolFn = (name: string, args: unknown) => Promise<unknown>;

const staticExecutors: Record<string, SingleToolExecutor> = {
  [getExchangeRateTool.definition.name]: getExchangeRateTool.execute,
  [getWeatherTool.definition.name]: getWeatherTool.execute,
  [flagVisaQuestionTool.definition.name]: flagVisaQuestionTool.execute,
};

async function dispatch(
  executors: Record<string, SingleToolExecutor>,
  name: string,
  args: unknown,
): Promise<unknown> {
  const executor = executors[name];
  if (!executor) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    return await executor(args);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Tool execution failed' };
  }
}

// update_trip_plan and remember_fact need to know which traveler/conversation
// is asking, unlike the other three tools which are context-free. They're
// deliberately left out of staticExecutors — calling either through
// executeTool() (the context-free path) reports it as unknown rather than
// silently no-op-ing.
export async function executeTool(name: string, args: unknown): Promise<unknown> {
  return dispatch(staticExecutors, name, args);
}

export interface ToolContext {
  prisma: PrismaClient;
  travelerId: string;
  conversationId: string;
}

export function createContextualExecuteTool(context: ToolContext): ExecuteToolFn {
  const tripPlanTool = createUpdateTripPlanTool(context);
  const rememberFactTool = createRememberFactTool(context);
  const executors: Record<string, SingleToolExecutor> = {
    ...staticExecutors,
    [updateTripPlanDefinition.name]: tripPlanTool.execute,
    [rememberFactDefinition.name]: rememberFactTool.execute,
  };
  return (name: string, args: unknown) => dispatch(executors, name, args);
}
