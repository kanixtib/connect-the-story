import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';

export type StoryNodeData = {
  content: string;
  /** 'root' | 'option' for layout/styling */
  kind?: 'root' | 'option';
  /** Parent node id; root has none, used to find siblings when one is chosen */
  parentId?: string | null;
  /** Depth in the story tree (0 = opening); used for layer color */
  layer?: number;
};

export function StoryNode({ data, selected }: NodeProps) {
  const { content, kind, layer = 0 } = data as StoryNodeData;
  const isRoot = kind === 'root';
  const layerClass = `story-node--layer-${layer % 16}`;

  return (
    <div
      className={`story-node ${isRoot ? 'story-node--root' : 'story-node--option'} ${layerClass} ${selected ? 'story-node--selected' : ''}`}
    >
      {!isRoot && (
        <Handle type="target" position={Position.Top} className="story-node__handle" />
      )}
      <p className="story-node__content">{content}</p>
      <Handle type="source" position={Position.Bottom} className="story-node__handle" />
    </div>
  );
}
