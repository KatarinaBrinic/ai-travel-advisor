import { describe, expect, it } from 'vitest';
import { createFlagVisaQuestionTool } from '../../src/llm/tools/flagVisaQuestion.ts';

describe('flagVisaQuestionTool', () => {
  it('has no required parameters and returns an unavailable marker if ever executed directly', async () => {
    const tool = createFlagVisaQuestionTool();
    expect(tool.definition.parameters.properties).toEqual({});
    await expect(tool.execute()).resolves.toEqual({ unavailable: true });
  });
});
