import { useEffect, useRef } from 'react';

import { displayLabelFor, type GraphIndex } from '@/shared/lib/graphIndex';
import { useGraphStore } from '@/stores/graphStore';

import { notionPageUrl } from './notionUrl';

type MenuItem = {
  label: string;
  icon?: string;
  onClick: () => void;
};

type Props = {
  index: GraphIndex;
};

export function ContextMenu({ index }: Props) {
  const contextMenu = useGraphStore((s) => s.contextMenu);
  const onClose = useGraphStore((s) => s.closeContextMenu);
  const menuRef = useRef<HTMLDivElement>(null);

  // Escape closes the menu. Outside-click closure is handled centrally in
  // GraphView's document-level pointer tracker so that a single gesture
  // can both close the menu AND defer the "click empty canvas clears
  // selection" UX to the next gesture.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!contextMenu) return null;
  const { x, y, node } = contextMenu;

  const items: MenuItem[] = [
    {
      label: 'Notion에서 열기',
      onClick: () => {
        window.open(notionPageUrl(node.id, 'notion'), '_self');
        onClose();
      },
    },
    {
      label: '브라우저에서 열기',
      onClick: () => {
        window.open(notionPageUrl(node.id, 'https'), '_blank');
        onClose();
      },
    },
    {
      label: 'ID 복사',
      onClick: () => {
        void navigator.clipboard.writeText(node.id);
        onClose();
      },
    },
  ];

  return (
    <div ref={menuRef} className="context-menu" style={{ left: x, top: y }}>
      <div className="context-menu-header">{displayLabelFor(index, node.id)}</div>
      {items.map((item) => (
        <button key={item.label} type="button" className="context-menu-item" onClick={item.onClick}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
