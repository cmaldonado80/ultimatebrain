'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { WorkflowDefinition } from '../../../../components/workflow-builder/types'
import { WorkflowCanvas } from '../../../../components/workflow-builder/workflow-canvas'
import { trpc } from '../../../../utils/trpc'

export default function WorkflowBuilderPage() {
  const router = useRouter()
  const [name, setName] = useState('Untitled Workflow')
  const createMut = trpc.flows.create.useMutation({
    onSuccess: () => router.push('/flows'),
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
      <WorkflowCanvas workflowName={name} onNameChange={setName} onSave={handleSave} />
    </div>
  )
}
