'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { WorkflowDefinition } from '../../../../components/workflow-builder/types'
import { WorkflowCanvas } from '../../../../components/workflow-builder/workflow-canvas'
import { trpc } from '../../../../utils/trpc'

export default function WorkflowBuilderPage() {
  const router = useRouter()
  const [name, setName] = useState('Untitled Workflow')
  const [saveError, setSaveError] = useState<string | null>(null)
  const createMut = trpc.flows.create.useMutation({
    onSuccess: () => router.push('/flows'),
    onError: () => setSaveError('Failed to save workflow. Please try again.'),
  })

  const handleSave = (workflow: WorkflowDefinition) => {
    createMut.mutate({
      name: workflow.name || name,
      description: `Visual workflow with ${workflow.blocks.length} blocks`,
      steps: workflow.blocks.map((block) => ({
        name: block.label,
        action: JSON.stringify({
          blockType: block.type,
          config: block.config,
          position: block.position,
          connections: workflow.edges
            .filter((e) => e.source === block.id)
            .map((e) => ({ target: e.target, handle: e.sourceHandle })),
        }),
      })),
    })
  }

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden">
      {saveError && (
        <div className="bg-neon-red/10 border border-neon-red/30 text-neon-red text-xs px-4 py-2">
          {saveError}
          <button className="ml-2 underline" onClick={() => setSaveError(null)}>
            dismiss
          </button>
        </div>
      )}
      {createMut.isPending && (
        <div className="bg-neon-teal/10 text-neon-teal text-xs px-4 py-2 text-center">
          Saving workflow...
        </div>
      )}
      <WorkflowCanvas workflowName={name} onNameChange={setName} onSave={handleSave} />
    </div>
  )
}
