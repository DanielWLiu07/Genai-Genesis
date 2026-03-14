'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTimelineStore, type Clip } from '@/stores/timeline-store';
import { api } from '@/lib/api';
import { SceneNode } from './SceneNode';

const nodeTypes: NodeTypes = {
  scene: SceneNode,
};

function clipsToNodes(clips: Clip[]): Node[] {
  return clips.map((clip) => ({
    id: clip.id,
    type: 'scene',
    position: clip.position || { x: clip.order * 280, y: 100 },
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
      style: { stroke: '#111', strokeWidth: 2 },
    });
  }
  return edges;
}

interface FlowEditorInnerProps {
  onNodeClick?: (clipId: string) => void;
}

function FlowEditorInner({ onNodeClick }: FlowEditorInnerProps) {
  const clips = useTimelineStore((s) => s.clips);
  const prevClipIds = useRef<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  // Sync React Flow state whenever clips change
  useEffect(() => {
    const newNodes = clipsToNodes(clips);
    const newEdges = clipsToEdges(clips);
    setNodes(newNodes);
    setEdges(newEdges);

    // Fit view when clip count changes (add/remove/reorder/initial load)
    const clipIds = clips.map((c) => c.id).join(',');
    if (clipIds !== prevClipIds.current && clips.length > 0) {
      // Small delay so React Flow has time to render nodes before fitting
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
    }
    prevClipIds.current = clipIds;
  }, [clips, setNodes, setEdges, fitView]);

  // Debounced auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId || clips.length === 0) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const { musicTrack, settings } = useTimelineStore.getState();
      api.updateTimeline(projectId, { clips, music_track: musicTrack, settings }).catch((err) =>
        console.error('Auto-save failed:', err)
      );
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [clips]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="bg-white/60"
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ animated: true }}
      >
        <Background color="#ddd" gap={20} />
        <Controls className="!bg-white !border-2 !border-[#ccc] !rounded-none [&>button]:!bg-white [&>button]:!border-[#ccc] [&>button]:!text-[#888] [&>button:hover]:!bg-[#f0f0f0]" />
        <MiniMap className="!bg-white !border-2 !border-[#ccc]" />
      </ReactFlow>
    </div>
  );
}

interface FlowEditorProps {
  onNodeClick?: (clipId: string) => void;
}

export function FlowEditor({ onNodeClick }: FlowEditorProps) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner onNodeClick={onNodeClick} />
    </ReactFlowProvider>
  );
}
