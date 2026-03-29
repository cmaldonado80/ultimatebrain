'use client'

import { useEffect } from 'react'

export function useChatKeyboardShortcuts(deps: {
  streaming: boolean
  inspectorOpen: boolean
  showCommands: boolean
  showMentions: boolean
  setInspectorOpen: (v: boolean | ((p: boolean) => boolean)) => void
  setShowCommands: (v: boolean) => void
  setShowMentions: (v: boolean) => void
  createSession: () => void
  abort: () => void
}) {
  const {
    streaming,
    inspectorOpen,
    showCommands,
    showMentions,
    setInspectorOpen,
    setShowCommands,
    setShowMentions,
    createSession,
    abort,
  } = deps

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+N → new conversation
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        createSession()
      }
      // Cmd+Shift+I → toggle inspector
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'I') {
        e.preventDefault()
        setInspectorOpen((v: boolean) => !v)
      }
      // Escape → stop generation or close inspector
      if (e.key === 'Escape') {
        if (streaming) abort()
        else if (inspectorOpen) setInspectorOpen(false)
        else if (showCommands) setShowCommands(false)
        else if (showMentions) setShowMentions(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    streaming,
    inspectorOpen,
    showCommands,
    showMentions,
    setInspectorOpen,
    setShowCommands,
    setShowMentions,
    createSession,
    abort,
  ])
}
