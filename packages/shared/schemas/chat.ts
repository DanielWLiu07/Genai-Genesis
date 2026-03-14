export interface ToolCall {
  tool_name: string;
  arguments: Record<string, any>;
  result?: any;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  tool_calls?: ToolCall[];
  timestamp?: string;
}

export type ToolName =
  | 'add_clip'
  | 'remove_clip'
  | 'update_clip'
  | 'reorder_clips'
  | 'set_transition'
  | 'set_music'
  | 'update_settings'
  | 'update_scene_duration'
  | 'regenerate_clip';
