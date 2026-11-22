import React, { useEffect, useRef, useState } from 'react';

// One pointer implementation for mouse, pen and touch; only the handle blocks scrolling.
export default function TaskOrderControls({ task, tasks, group, onMove, onPreview }) {
  const drag = useRef(null);
  const frame = useRef(null);
  const [active, setActive] = useState(false);
  const index = tasks.findIndex((item) => item.id === task.id);
  const cancel = () => {
    cancelAnimationFrame(frame.current);
    drag.current = null;
    setActive(false);
    onPreview?.(null);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const hit = (state) => {
    const element = document.elementFromPoint(state.x, state.y);
    const list = element?.closest('[data-order-group]');
    if (!list || !state.scope.contains(list)) return null;
    const cards = [...list.querySelectorAll('[data-order-task]')].filter((card) => card.dataset.orderTask !== task.id);
    const before = cards.find((card) => state.y < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2);
    return { group: list.dataset.orderGroup, targetId: before?.dataset.orderTask || null };
  };
  const tick = () => {
    const state = drag.current;
    if (!state?.moved) return;
    const edge = 55;
    if (state.y < edge) window.scrollBy(0, -12);
    else if (state.y > window.innerHeight - edge) window.scrollBy(0, 12);
    const scroller = state.scope.closest('[data-order-scroll]') || state.scope;
    const rect = scroller.getBoundingClientRect();
    if (state.x < rect.left + edge) scroller.scrollLeft -= 10;
    else if (state.x > rect.right - edge) scroller.scrollLeft += 10;
    state.target = hit(state);
    onPreview?.(state.target);
    frame.current = requestAnimationFrame(tick);
  };
  const moveOne = (direction) => {
    if (direction < 0 && index > 0) onMove(tasks[index - 1].id, group);
    if (direction > 0 && index < tasks.length - 1) onMove(tasks[index + 2]?.id || null, group);
  };
  return <div className="flex items-center gap-1 flex-wrap">
    <button type="button" aria-label={`Drag ${task.roomLabel} to reorder; arrow keys also move priority`}
      style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
      className={`min-w-11 min-h-11 rounded-lg border select-none cursor-grab active:cursor-grabbing ${active ? 'bg-lime-100 border-green-700' : 'bg-white border-slate-200'}`}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={(event) => { if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); moveOne(event.key === 'ArrowUp' ? -1 : 1); } }}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, scope: event.currentTarget.closest('[data-order-scope]'), moved: false };
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (!state || state.pointerId !== event.pointerId) return;
        state.x = event.clientX; state.y = event.clientY;
        if (!state.moved && Math.hypot(state.x - state.startX, state.y - state.startY) >= 6) {
          state.moved = true; setActive(true); tick();
        }
      }}
      onPointerUp={(event) => {
        const state = drag.current;
        if (!state || state.pointerId !== event.pointerId) return;
        state.x = event.clientX; state.y = event.clientY;
        const target = state.moved ? hit(state) : null;
        cancel();
        if (target) onMove(target.targetId, target.group);
      }}
      onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current) cancel(); }}
    >⋮⋮</button>
    <button type="button" aria-label={`Move ${task.roomLabel} up`} disabled={index <= 0} onClick={() => moveOne(-1)} className="min-w-11 min-h-11 border rounded-lg bg-white disabled:opacity-30">↑</button>
    <button type="button" aria-label={`Move ${task.roomLabel} down`} disabled={index === tasks.length - 1} onClick={() => moveOne(1)} className="min-w-11 min-h-11 border rounded-lg bg-white disabled:opacity-30">↓</button>
  </div>;
}
