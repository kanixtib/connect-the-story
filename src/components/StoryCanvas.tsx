import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { StoryNode } from './StoryNode';
import type { StoryNodeData } from './StoryNode';
import './StoryNode.css';

const nodeTypes = { story: StoryNode };

/** Each starter has one opening line and three continuations that fit that opening. */
const STORY_STARTERS: { opening: string; options: [string, string, string] }[] = [
  {
    opening: 'At 2:17am, the lights in the apartment flickered for the third time.',
    options: [
      'She reached for the flashlight in the drawer, fingers brushing past the old photograph.',
      'He pulled the blanket over his head and told himself it was just the wiring.',
      'The dog was already at the door, ears flat, staring at the hallway.',
    ],
  },
  {
    opening: 'The letter had been sitting on the kitchen table for three days, unopened.',
    options: [
      'She picked it up and ran her thumb along the seal.',
      'He dropped it in the recycling and told himself he’d forget about it.',
      'The handwriting on the envelope was familiar—too familiar.',
    ],
  },
  {
    opening: 'Nobody had lived in the house at the end of the lane for twenty years—until last Tuesday.',
    options: [
      'The moving van was still in the drive; no one had seen who’d arrived.',
      'She’d walked past it every morning; today the curtains were open.',
      'He’d always been told to stay away from that house.',
    ],
  },
  {
    opening: 'She woke to the sound of keys in the door, but she lived alone.',
    options: [
      'She reached for her phone and the number for the police.',
      'She lay still and listened to footsteps in the hall.',
      'The keys were still on the hook by the door where she’d left them.',
    ],
  },
  {
    opening: 'The last bus had already gone when he noticed the figure in the bus shelter.',
    options: [
      'He could still walk the four miles home, or he could say something.',
      'The figure hadn’t moved; it might have been asleep.',
      'He crossed the road and kept his head down.',
    ],
  },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Build a full set of initial nodes with unique ids so Restart always shows new content. */
function buildInitialNodes(): Node[] {
  const starter = pickRandom(STORY_STARTERS);
  const [optA, optB, optC] = starter.options;
  const sessionId = `s${Date.now()}`;
  const rootId = `root-${sessionId}`;
  return [
    {
      id: rootId,
      type: 'story',
      position: { x: 250, y: 80 },
      data: {
        content: starter.opening,
        kind: 'root',
        parentId: null,
        layer: 0,
      },
    },
    {
      id: `option-a-${sessionId}`,
      type: 'story',
      position: { x: 80, y: 280 },
      data: { content: optA, kind: 'option', parentId: rootId, layer: 1 },
    },
    {
      id: `option-b-${sessionId}`,
      type: 'story',
      position: { x: 250, y: 280 },
      data: { content: optB, kind: 'option', parentId: rootId, layer: 1 },
    },
    {
      id: `option-c-${sessionId}`,
      type: 'story',
      position: { x: 420, y: 280 },
      data: { content: optC, kind: 'option', parentId: rootId, layer: 1 },
    },
  ];
}

const initialEdges: Edge[] = [];

function getPathSoFar(nodes: Node[], fromNodeId: string): string[] {
  const path: string[] = [];
  let id: string | null = fromNodeId;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  while (id) {
    const node = byId.get(id);
    if (!node) break;
    const content = (node.data as StoryNodeData).content;
    if (content) path.unshift(content);
    const parentId = (node.data as StoryNodeData).parentId;
    id = parentId ?? null;
  }
  return path;
}

type StoryCanvasProps = {
  onRestart: () => void;
};

export function StoryCanvas({ onRestart }: StoryCanvasProps) {
  // Compute initial nodes exactly once per mount so all 4 nodes come from the same starter.
  const initialNodes = useMemo(() => buildInitialNodes(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [loadingNodeId, setLoadingNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onConnect = useCallback(
    (params: Connection) => {
      setError(null);
      const sourceId = params.source ?? '';
      const targetId = params.target ?? '';
      const chosenNode = nodes.find((n) => n.id === targetId);
      const parentId = (chosenNode?.data as StoryNodeData)?.parentId ?? sourceId;

      // Siblings = same parent, not the chosen node (we'll remove these)
      const siblingIds = nodes
        .filter((n) => (n.data as StoryNodeData).parentId === parentId && n.id !== targetId)
        .map((n) => n.id);

      // 1) Add the new edge AND remove edges to/from siblings in a single update (avoids batching wiping the new edge)
      setEdges((eds) => {
        const withNew = addEdge(params, eds);
        return withNew.filter(
          (e) => !siblingIds.includes(e.source) && !siblingIds.includes(e.target)
        );
      });

      // 2) Remove sibling nodes
      setNodes((nds) => nds.filter((n) => !siblingIds.includes(n.id)));

      // 3) If chosen node already has children (outgoing edges), don't generate again
      const hasChildren = edges.some((e) => e.source === targetId);
      if (hasChildren) return;

      setLoadingNodeId(targetId);

      const pathSoFar = getPathSoFar(nodes, sourceId);
      const nodeContent = (chosenNode?.data as StoryNodeData)?.content ?? '';
      const chosenPosition = chosenNode?.position ?? { x: 250, y: 280 };

      fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeContent, pathSoFar }),
      })
        .then(async (res) => {
          const text = await res.text();
          let data: { error?: string; continuations?: string[] };
          try {
            data = text.length ? JSON.parse(text) : {};
          } catch {
            if (!res.ok) throw new Error(res.statusText || 'Server error');
            throw new Error('Invalid response from server');
          }
          if (!res.ok) throw new Error(data.error ?? res.statusText ?? 'Request failed');
          return data as { continuations: string[] };
        })
        .then((data: { continuations: string[] }) => {
          const continuations = Array.isArray(data.continuations) ? data.continuations.slice(0, 3) : [];
          if (continuations.length === 0) {
            setError('No story options returned.');
            return;
          }

          const baseY = chosenPosition.y + 220;
          // Fixed node width 260px; use 320px between left edges so options never overlap
          const nodeWidth = 260;
          const gap = 60;
          const spacing = nodeWidth + gap;
          const totalWidth = (continuations.length - 1) * spacing;
          const baseX = chosenPosition.x - totalWidth / 2;

          const parentLayer = (chosenNode?.data as StoryNodeData)?.layer ?? 0;
          const childLayer = parentLayer + 1;

          const newNodes: Node[] = continuations.map((content, i) => ({
            id: `${targetId}-${Date.now()}-${i}`,
            type: 'story',
            position: { x: baseX + i * spacing, y: baseY },
            data: {
              content,
              kind: 'option',
              parentId: targetId,
              layer: childLayer,
            },
          }));

          setNodes((nds) => [...nds, ...newNodes]);
          // No edges: user connects from the chosen node to one of these when ready
        })
        .catch((err) => {
          console.error('Generate failed:', err);
          setError(err instanceof Error ? err.message : 'Could not generate next options.');
        })
        .finally(() => {
          setLoadingNodeId(null);
        });
    },
    [nodes, edges, setNodes, setEdges]
  );

  return (
    <div className="story-canvas-wrap" style={{ width: '100%', height: '100%', position: 'relative' }}>
      {loadingNodeId && (
        <div className="story-canvas-loading" aria-live="polite">
          Generating next moments…
        </div>
      )}
      {error && (
        <div className="story-canvas-error" role="alert">
          {error}
        </div>
      )}
      <button
        type="button"
        className="story-canvas-restart"
        onClick={onRestart}
        aria-label="Restart story"
      >
        Restart
      </button>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={8}
          size={0.4}
          color="#D4D1CC"
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}
