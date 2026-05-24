import { DatabaseManager, RuntimeJobRecord } from '../db/index.js';

export type RuntimeJobType = 'daily_run' | 'test_push';

export class RuntimeJobQueue {
  constructor(private db: DatabaseManager) {}

  enqueue(userId: string, jobType: RuntimeJobType, payload: unknown = {}, scheduledFor?: Date): number {
    return this.db.insertRuntimeJob({
      user_id: userId,
      job_type: jobType,
      status: 'queued',
      payload_json: JSON.stringify(payload),
      scheduled_for: scheduledFor?.toISOString(),
    });
  }

  claimNext(): RuntimeJobRecord | undefined {
    return this.db.claimNextRuntimeJob();
  }

  complete(jobId: number, runLogId?: number): void {
    this.db.updateRuntimeJobStatus(jobId, 'succeeded', { runLogId });
  }

  fail(jobId: number, error: Error, runLogId?: number): void {
    this.db.updateRuntimeJobStatus(jobId, 'failed', {
      lastError: error.message,
      runLogId,
    });
  }

  list(limit: number = 50): RuntimeJobRecord[] {
    return this.db.listRuntimeJobs(limit);
  }

  markInterrupted(reason: string): { jobs: number; runs: number } {
    return this.db.markInterruptedRuntimeWork(reason);
  }
}
