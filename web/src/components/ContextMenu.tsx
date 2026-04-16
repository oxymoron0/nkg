import { useEffect, useRef } from 'react';
import type { GraphNode } from '../api/graph';

type MenuItem = {
  label: string;
  icon?: string;
  onClick: () => void;
};

type Props = {
  x: number;
  y: number;
  node: GraphNode;
  onClose: () => void;
};

function notionPageUrl(pageId: string, protocol: 'https' | 'notion'): string {
  // Insert dashes into the 32-char hex ID for Notion URL format.
  const id = pageId.replace(/-/g, '');
  const dashed = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  return `${protocol}://www.notion.so/${dashed}`;
}

export function ContextMenu({ x, y, node, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

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
        navigator.clipboard.writeText(node.id);
        onClose();
      },
    },
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      <div className="context-menu-header">{node.label}</div>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="context-menu-item"
          onClick={item.onClick}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
