export { type AnalysisResult, analyzeAgentPerformance, type FailurePattern } from './analyzer'
export {
  type AutoEvolutionConfig,
  type AutoEvolutionResult,
  runAutoEvolution,
} from './auto-evolution'
export {
  type CrossLearningResult,
  extractSoulFragments,
  getRelevantFragments,
  runCrossAgentLearning,
  type SoulFragment,
} from './cross-agent-learning'
export {
  type EvolutionConfig,
  type EvolutionResult,
  evolveAgent,
  getEvolutionHistory,
  rollbackToVersion,
  snapshotSoulVersion,
} from './evolution-service'
export { type GateInput, type GateResult, isConverged, validateMutation } from './gating'
