'use client'

import { useCallback, useState } from 'react'

import { type InspectorSelection } from '../../components/chat/inspector-panel'

export function useInspector() {
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorSelection, setInspectorSelection] = useState<InspectorSelection>(null)

  const handleInspect = useCallback((selection: InspectorSelection) => {
    setInspectorSelection(selection)
    setInspectorOpen(true)
  }, [])

  return { inspectorOpen, setInspectorOpen, inspectorSelection, handleInspect }
}
