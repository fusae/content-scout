import { ContentAggregator } from '../aggregator';
import { ProfileManager } from '../profile';
import { FilterEngine } from '../filter';
import { DraftGenerator } from '../generator';
import { FeishuClient } from '../feishu';
import { FeedbackLearner } from '../feedback';
import { DatabaseManager } from '../db';
export declare class Scheduler {
    private aggregator;
    private profileManager;
    private filterEngine;
    private draftGenerator;
    private feishuClient;
    private feedbackLearner;
    private db;
    private tasks;
    constructor(aggregator: ContentAggregator, profileManager: ProfileManager, filterEngine: FilterEngine, draftGenerator: DraftGenerator, feishuClient: FeishuClient, feedbackLearner: FeedbackLearner, db: DatabaseManager);
    start(): void;
    stop(): void;
    runDailyTask(): Promise<void>;
    runWeeklyLearning(): Promise<void>;
    runCleanup(): Promise<void>;
    runManually(): Promise<void>;
    private notifyError;
}
//# sourceMappingURL=index.d.ts.map