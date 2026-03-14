'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ChevronLeft, ChevronRight, Lock, Unlock, Maximize2, LayoutGrid, CloudOff } from 'lucide-react';

const nodeTypes: NodeTypes = {
  scene: SceneNode,
};

const NODE_W = 260;  // must match SceneNode width exactly
const NODE_H = 340;  // actual rendered height (~290px card + buffer)
const GAP_X = 50;    // horizontal gap between cards
const GAP_Y = 60;    // vertical gap between rows
const COLS = 3;

function clipsToNodes(clips: Clip[]): Node[] {
  const sorted = [...clips].sort((a, b) => a.order - b.order);
  return sorted.map((clip, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return {
      id: clip.id,
      type: 'scene',
      position: { x: col * (NODE_W + GAP_X), y: row * (NODE_H + GAP_Y) },
      data: { clip },
    };
  });
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
  const { fitView, setCenter, getNodes } = useReactFlow();
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [locked, setLocked] = useState(false);
  const [unsaved, setUnsaved] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const sortedClips = useMemo(() => [...clips].sort((a, b) => a.order - b.order), [clips]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id);
    // Also focus on clicked node
    const idx = sortedClips.findIndex((c) => c.id === node.id);
    if (idx >= 0) {
      setFocusedIdx(idx);
      if (locked) {
        const n = getNodes().find((n) => n.id === node.id);
        if (n) {
          setCenter(n.position.x + NODE_W / 2, n.position.y + NODE_H / 2, { zoom: 1.2, duration: 400 });
        }
      }
    }
  }, [onNodeClick, sortedClips, locked, getNodes, setCenter]);

  // Zoom to a specific clip index
  const zoomToClip = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, sortedClips.length - 1));
    setFocusedIdx(clamped);
    const clipId = sortedClips[clamped]?.id;
    if (!clipId) return;
    const n = getNodes().find((n) => n.id === clipId);
    if (n) {
      setCenter(n.position.x + NODE_W / 2, n.position.y + NODE_H / 2, { zoom: 1.2, duration: 400 });
    }
  }, [sortedClips, getNodes, setCenter]);

  const goNext = useCallback(() => zoomToClip(focusedIdx + 1), [focusedIdx, zoomToClip]);
  const goPrev = useCallback(() => zoomToClip(focusedIdx - 1), [focusedIdx, zoomToClip]);
  const showAll = useCallback(() => fitView({ padding: 0.15, duration: 400 }), [fitView]);

  // Re-layout all nodes into a clean grid, resetting any drift/overlap
  const cleanupLayout = useCallback(() => {
    const newNodes = clipsToNodes(clips);
    setNodes(newNodes);
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50);
  }, [clips, setNodes, fitView]);

  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  // Sync React Flow state whenever clips change — always reset to clean grid positions
  useEffect(() => {
    const newNodes = clipsToNodes(clips);  // positions recalculated from scratch
    const newEdges = clipsToEdges(clips);
    setNodes(newNodes);
    setEdges(newEdges);

    const clipIds = clips.map((c) => c.id).join(',');
    if (clipIds !== prevClipIds.current && clips.length > 0) {
      setTimeout(() => {
        if (lockedRef.current) {
          setFocusedIdx(0);
          // Zoom to first node directly instead of calling zoomToClip
          const sorted = [...clips].sort((a, b) => a.order - b.order);
          const firstId = sorted[0]?.id;
          if (firstId) {
            const n = getNodes().find((n) => n.id === firstId);
            if (n) {
              setCenter(n.position.x + NODE_W / 2, n.position.y + NODE_H / 2, { zoom: 1.2, duration: 400 });
            }
          }
        } else {
          fitView({ padding: 0.15, duration: 400 });
        }
      }, 150);
    }
    prevClipIds.current = clipIds;
  }, [clips, setNodes, setEdges, fitView, getNodes, setCenter]);

  // Debounced auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const projectId = useTimelineStore.getState().projectId;
    if (!projectId || clips.length === 0) return;

    setUnsaved(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const { musicTrack, settings } = useTimelineStore.getState();
      api.updateTimeline(projectId, { clips, music_track: musicTrack, settings })
        .then(() => setUnsaved(false))
        .catch(() => {
          // Keep unsaved indicator — backend may not be running
        });
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [clips]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); showAll(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, showAll]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        className="bg-white/60"
        minZoom={0.15}
        maxZoom={2.5}
        defaultEdgeOptions={{ animated: true }}
        panOnDrag={!locked}
        zoomOnScroll={!locked}
        zoomOnPinch={!locked}
        zoomOnDoubleClick={!locked}
      >
        <Background color="#ddd" gap={20} />
        <Controls className="!bg-white !border-2 !border-[#ccc] !rounded-none [&>button]:!bg-white [&>button]:!border-[#ccc] [&>button]:!text-[#888] [&>button:hover]:!bg-[#f0f0f0]" />
        <MiniMap className="!bg-white !border-2 !border-[#ccc]" />
      </ReactFlow>

      {/* Empty timeline state */}
      {clips.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-[#ccc] text-sm tracking-widest" style={{ fontFamily: 'var(--font-manga)' }}>NO SCENES</p>
            <p className="text-[#ddd] text-xs mt-1">Generate a trailer plan to start →</p>
          </div>
        </div>
      )}

      {/* Unsaved indicator */}
      {unsaved && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2 py-1 bg-white/90 border border-[#ddd] text-[0.6rem] text-[#999]"
             style={{ fontFamily: 'var(--font-manga)' }}>
          <CloudOff size={10} /> Unsaved
        </div>
      )}

      {/* Navigation controls */}
      {clips.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
          {/* Previous */}
          <button
            onClick={goPrev}
            disabled={focusedIdx <= 0}
            className="manga-btn bg-white text-[#111] px-2 py-2 disabled:opacity-30"
            title="Previous frame"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Frame counter */}
          <span
            className="bg-white border-2 border-[#111] px-3 py-1 text-sm min-w-[80px] text-center"
            style={{ fontFamily: 'var(--font-manga)', boxShadow: '2px 2px 0px #000' }}
          >
            {focusedIdx + 1} / {sortedClips.length}
          </span>

          {/* Next */}
          <button
            onClick={goNext}
            disabled={focusedIdx >= sortedClips.length - 1}
            className="manga-btn bg-white text-[#111] px-2 py-2 disabled:opacity-30"
            title="Next frame"
          >
            <ChevronRight size={18} />
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-[#ccc] mx-1" />

          {/* Lock/Unlock */}
          <button
            onClick={() => {
              setLocked(!locked);
              if (!locked) {
                // Re-locking: zoom to current frame
                zoomToClip(focusedIdx);
              }
            }}
            className={`manga-btn px-2 py-2 ${locked ? 'bg-[#111] text-white' : 'bg-white text-[#111]'}`}
            title={locked ? 'Locked on frame — click to free move' : 'Free move — click to lock on frame'}
          >
            {locked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>

          {/* Fit all */}
          <button
            onClick={showAll}
            className="manga-btn bg-white text-[#111] px-2 py-2"
            title="Show all frames"
          >
            <Maximize2 size={16} />
          </button>

          {/* Cleanup layout */}
          <button
            onClick={cleanupLayout}
            className="manga-btn bg-white text-[#111] px-2 py-2"
            title="Clean up layout — reset node positions to grid"
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      )}
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
