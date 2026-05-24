import { config, ensureDirectories } from '../config.js';
import { DatabaseManager } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { RuntimeConfigRepository } from './config-repository.js';
import { RuntimeJobQueue } from './job-queue.js';
import { RuntimeTaskRunner } from './task-runner.js';

export class RuntimeWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private queue: RuntimeJobQueue,
    private configRepository: RuntimeConfigRepository,
    private taskRunner: RuntimeTaskRunner,
    private pollIntervalMs: number = 5000
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    const recovered = this.queue.markInterrupted('Worker restarted before this job finished');
    if (recovered.jobs > 0 || recovered.runs > 0) {
      logger.warn(`Marked interrupted runtime work as failed: ${recovered.jobs} jobs, ${recovered.runs} runs`);
    }

    this.timer = setInterval(() => {
      void this.processNext();
    }, this.pollIntervalMs);
    void this.processNext();
    logger.info(`Runtime worker started, poll interval ${this.pollIntervalMs}ms`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    logger.info('Runtime worker stopped');
  }

  async processNext(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const job = this.queue.claimNext();
      if (!job?.id) {
        return;
      }

      const runtimeConfig = this.configRepository.get(job.user_id);
      if (!runtimeConfig) {
        throw new Error(`Runtime config not found: ${job.user_id}`);
      }

      try {
        if (job.job_type === 'daily_run') {
          await this.taskRunner.runDaily(runtimeConfig);
        } else if (job.job_type === 'test_push') {
          await this.taskRunner.sendTestPush(runtimeConfig);
        } else {
          throw new Error(`Unknown job type: ${job.job_type}`);
        }

        this.queue.complete(job.id);
      } catch (error) {
        this.queue.fail(job.id, error as Error);
        logger.error(`Runtime job failed: ${job.id}`, error as Error);
      }
    } finally {
      this.running = false;
    }
  }
}

function main(): void {
  ensureDirectories();
  const db = new DatabaseManager(config.dbPath);
  db.initialize();

  const queue = new RuntimeJobQueue(db);
  const repository = new RuntimeConfigRepository(db);
  const runner = new RuntimeTaskRunner(db);
  const worker = new RuntimeWorker(queue, repository, runner);
  worker.start();

  const shutdown = (): void => {
    worker.stop();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1]?.endsWith('worker.ts') || process.argv[1]?.endsWith('worker.js')) {
  main();
}
