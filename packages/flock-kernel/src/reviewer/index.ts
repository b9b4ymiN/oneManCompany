/**
 * Flock Reviewer Module
 *
 * Automated reviewer agent mode with consensus support.
 */

export type {
  ConsensusResult,
  ReviewerSpawnConfig,
  ParsedReviewOutput,
} from './reviewer-engine';

export { ReviewerEngine, createReviewerEngine } from './reviewer-engine';
