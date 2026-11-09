export type ToolParameterType = 'string' | 'number' | 'boolean';

export interface ToolParameter {
  type: ToolParameterType;
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolExecutionContext {
  signal?: AbortSignal;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string> | string;
}

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  raw: string;
}

export interface ParseToolCallsResult {
  calls: ParsedToolCall[];
  errors: string[];
}

export interface ToolResult {
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  content: string;
  durationMs: number;
}
