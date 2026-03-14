'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
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
import { api } from '@/lib/api';
import { SceneNode } from './SceneNode';
import gsap from 'gsap';

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
      style: { stroke: '#111', strokeWidth: 2 },
    });
  }
  return edges;
}

export function FlowEditor() {
  const clips = useTimelineStore((s) => s.clips);
  const initialNodes = useMemo(() => clipsToNodes(clips), [clips]);
  const initialEdges = useMemo(() => clipsToEdges(clips), [clips]);
  const prevClipCount = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Animate nodes staggering in when clips first appear or new ones are added
  useEffect(() => {
    if (clips.length > 0 && clips.length > prevClipCount.current) {
      // Small delay to let React Flow render the DOM nodes
      requestAnimationFrame(() => {
        const nodeElements = containerRef.current?.querySelectorAll('.react-flow__node');
        if (nodeElements && nodeElements.length > 0) {
          // Only animate new nodes
          const startIdx = prevClipCount.current;
          const newNodes = Array.from(nodeElements).slice(startIdx);
          if (newNodes.length > 0) {
            gsap.fromTo(newNodes,
              { opacity: 0, scale: 0.8, y: 20 },
              { opacity: 1, scale: 1, y: 0, duration: 0.4, stagger: 0.06, ease: 'back.out(1.3)' }
            );
          }
        }
      });
    }
    prevClipCount.current = clips.length;
  }, [clips.length]);

  // Animate controls and minimap on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const controls = containerRef.current.querySelector('.react-flow__controls');
      const minimap = containerRef.current.querySelector('.react-flow__minimap');
      if (controls) {
        gsap.fromTo(controls, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' });
      }
      if (minimap) {
        gsap.fromTo(minimap, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, delay: 0.1, ease: 'power2.out' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Debounced auto-save when clips change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId || clips.length === 0) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api.updateTimeline(projectId, { clips }).catch((err) =>
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
        nodeTypes={nodeTypes}
        fitView
        className="bg-[#f5f5f5]"
      >
        <Background color="#ddd" gap={20} />
        <Controls className="!bg-white !border-2 !border-[#ccc] !rounded-none [&>button]:!bg-white [&>button]:!border-[#ccc] [&>button]:!text-[#888] [&>button:hover]:!bg-[#f0f0f0]" />
        <MiniMap className="!bg-white !border-2 !border-[#ccc]" />
      </ReactFlow>
    </div>
  );
}
