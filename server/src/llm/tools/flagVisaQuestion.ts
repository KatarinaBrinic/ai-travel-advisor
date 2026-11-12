export const flagVisaQuestionDefinition = {
  type: 'function' as const,
  name: 'flag_visa_immigration_question',
  description:
    "Call this whenever the user's question depends on CURRENT visa, entry, or immigration " +
    "requirements (for example: 'do I need a visa for X', 'can I enter Y without a visa', " +
    "'what are the current entry requirements for Z'). Do not attempt to answer such questions " +
    'from your own knowledge, even if you believe you know the answer — visa rules change ' +
    'frequently and cannot be verified live right now, so always call this tool instead of guessing.',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

export function createFlagVisaQuestionTool() {
  return {
    definition: flagVisaQuestionDefinition,
    async execute(): Promise<unknown> {
      // Not expected to run in practice — chatLoop short-circuits on this
      // tool name before dispatching to an executor. Kept as a safe,
      // harmless fallback in case that check is ever bypassed.
      return { unavailable: true };
    },
  };
}
