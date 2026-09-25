import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '../../../lib/utils'

export function SplitPane({ 
  direction = 'horizontal', 
  children, 
  sizes: controlledSizes,
  defaultSizes = [50, 50],
  minSize = 100,
  onSizesChange 
}) {
  const [sizes, setSizes] = useState(() => controlledSizes || defaultSizes)

  // Sync with controlled prop if provided
  useEffect(() => {
    if (controlledSizes !== undefined) {
      setSizes(controlledSizes)
    }
  }, [controlledSizes])

  const panesRef = useRef([])
  const isResizing = useRef(null)
  const startPos = useRef(0)
  const startSizes = useRef([])

  const handleMouseMove = useCallback((e) => {
    if (!isResizing.current) return
    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY
    const delta = currentPos - startPos.current
    const totalSize = panesRef.current.reduce((sum, pane) => sum + (direction === 'horizontal' ? pane.offsetWidth : pane.offsetHeight), 0)
    const deltaPercent = (delta / totalSize) * 100
    
    const newSizes = [...startSizes.current]
    newSizes[isResizing.current.index] += deltaPercent
    newSizes[isResizing.current.index + 1] -= deltaPercent
    
    // Clamp to minSize
    const minPercent = (minSize / totalSize) * 100
    if (newSizes[isResizing.current.index] >= minPercent && newSizes[isResizing.current.index + 1] >= minPercent) {
      setSizes(newSizes)
      onSizesChange?.(newSizes)
    }
  }, [direction, minSize, onSizesChange])

  const handleMouseDown = useCallback((index, e) => {
    if (index >= children.length - 1) return
    isResizing.current = { index }
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY
    startSizes.current = [...sizes]
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }, [direction, sizes])

  const handleMouseUp = useCallback(() => {
    isResizing.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return (
    <div 
      className={cn('flex', direction === 'horizontal' ? 'flex-row' : 'flex-col', 'h-full w-full')}
      style={{ 
        height: '100%', 
        width: '100%' 
      }}
    >
      {children.map((child, index) => (
        <div
          key={index}
          ref={(el) => { panesRef.current[index] = el }}
          className={cn('flex-1 overflow-hidden min-w-0 min-h-0', index > 0 && 'relative')}
          style={{ 
            flex: `0 0 ${sizes[index]}%`,
            minWidth: direction === 'horizontal' ? minSize : undefined,
            minHeight: direction === 'vertical' ? minSize : undefined
          }}
        >
          {child}
          {index < children.length - 1 && (
            <div
              className={cn(
                'absolute z-10 transition-colors',
                direction === 'horizontal' 
                  ? 'right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/30' 
                  : 'bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-accent/30'
              )}
              onMouseDown={(e) => handleMouseDown(index, e)}
              aria-label="Resize pane"
            />
          )}
        </div>
      ))}
    </div>
  )
}

export function SplitPaneGroup({ 
  panes, 
  direction = 'horizontal',
  onLayoutChange 
}) {
  const [sizes, setSizes] = useState(() => {
    const equal = 100 / panes.length
    return panes.map(() => equal)
  })

  return (
    <SplitPane 
      direction={direction} 
      defaultSizes={sizes}
      onSizesChange={setSizes}
    >
      {panes.map((pane, i) => (
        <div key={i} className="flex-1 h-full w-full">
          {pane}
        </div>
      ))}
    </SplitPane>
  )
}