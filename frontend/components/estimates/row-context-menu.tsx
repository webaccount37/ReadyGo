"use client";

import React, { useEffect, useRef } from "react";

interface RowContextMenuProps {
  x: number;
  y: number;
  onAddAbove: () => void;
  onAddBelow: () => void;
  onClose: () => void;
}

export function RowContextMenu({
  x,
  y,
  onAddAbove,
  onAddBelow,
  onClose,
}: RowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border border-gray-300 shadow-lg rounded-md py-1 z-50 min-w-[150px]"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      <button
        onClick={() => {
          onAddAbove();
          onClose();
        }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
      >
        Add Row Above
      </button>
      <button
        onClick={() => {
          onAddBelow();
          onClose();
        }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
      >
        Add Row Below
      </button>
    </div>
  );
}


