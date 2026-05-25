import React, { useState, useEffect, useMemo, useRef } from 'react';

const ITEM_HEIGHT = 60; // Height of each row in pixels

const VirtualizedTable = React.memo(({ 
  items, 
  renderItem, 
  containerHeight = 400,
  loadMore,
  hasMore = false,
  loading = false 
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef();
  
  // Calculate visible range
  const visibleRange = useMemo(() => {
    const visibleStart = Math.floor(scrollTop / ITEM_HEIGHT);
    const visibleEnd = Math.min(
      visibleStart + Math.ceil(containerHeight / ITEM_HEIGHT) + 5, // Buffer of 5 items
      items.length
    );
    
    return { start: visibleStart, end: visibleEnd };
  }, [scrollTop, containerHeight, items.length]);

  // Handle scroll
  const handleScroll = (e) => {
    const newScrollTop = e.target.scrollTop;
    setScrollTop(newScrollTop);
    
    // Load more when near bottom
    if (hasMore && !loading && loadMore) {
      const { scrollTop, scrollHeight, clientHeight } = e.target;
      if (scrollTop + clientHeight >= scrollHeight - 100) { // 100px buffer
        loadMore();
      }
    }
  };

  // Get visible items
  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end).map((item, index) => ({
      ...item,
      virtualIndex: visibleRange.start + index
    }));
  }, [items, visibleRange.start, visibleRange.end]);

  const totalHeight = items.length * ITEM_HEIGHT;
  const offsetY = visibleRange.start * ITEM_HEIGHT;

  return (
    <div 
      ref={containerRef}
      className="overflow-auto"
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => (
            <div 
              key={item.id || index}
              style={{ height: ITEM_HEIGHT }}
              className="flex items-center"
            >
              {renderItem(item, visibleRange.start + index)}
            </div>
          ))}
          {loading && (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

VirtualizedTable.displayName = 'VirtualizedTable';

export default VirtualizedTable;