'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTimelineStore, type Clip } from '@/stores/timeline-store';
import { SceneNode } from './SceneNode';

const nodeTypes: NodeTypes = {
  scene: SceneNode,
};

function clipsToNodes(clips: Clip[]): Node[] {
  return clips.map((clip) => ({
    id: clip.id,
    type: 'scene',
    position: clip.position,
    data: { clip },
  }));
}

function clipsToEdges(clips: Clip[]): Edge[] {
  const sorted = [...clips].sort((a, b) => a.order - b.order);
  const edges: Edge[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    edges.push({
      id: `e-${sorted[i].id}-${sorted[i + 1].id}`,
      source: sorted[i].id,
      target: sorted[i + 1].id,
      type: 'smoothstep',
      animated: true,
    });
  }
  return edges;
}

export function FlowEditor() {
  const clips = useTimelineStore((s) => s.clips);
  const initialNodes = useMemo(() => clipsToNodes(clips), [clips]);
  const initialEdges = useMemo(() => clipsToEdges(clips), [clips]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  // Sync when clips change
  useEffect(() => {
    setNodes(clipsToNodes(clips));
    setEdges(clipsToEdges(clips));
  }, [clips, setNodes, setEdges]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-zinc-950"
      >
        <Background color="#333" gap={20} />
        <Controls className="!bg-zinc-800 !border-zinc-700" />
        <MiniMap className="!bg-zinc-800" />
      </ReactFlow>
    </div>
  );
}
