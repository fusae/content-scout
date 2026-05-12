import { DatabaseManager } from '../db';
import { AccountProfile } from '../profile/types';
interface FeedbackPattern {
    acceptedTopics: string[];
    rejectedTopics: string[];
    preferredSources: string[];
    avoidedSources: string[];
    acceptanceRate: number;
    totalFeedbacks: number;
}
interface FeedbackLog {
    id: number;
    recommendationId: number;
    action: 'accept' | 'reject' | 'modify' | 'view_source';
    modifiedDraft?: string;
    createdAt: Date;
    contentSource?: string;
    contentTopics?: string[];
}
export declare class FeedbackLearner {
    private db;
    constructor(db: DatabaseManager);
    analyzeFeedback(feedbacks: FeedbackLog[]): Promise<FeedbackPattern>;
    updateProfile(profile: AccountProfile, pattern: FeedbackPattern): Promise<AccountProfile>;
    shouldTriggerLearning(): Promise<boolean>;
    private extractTopics;
    private extractSources;
    private adjustTopicWeights;
    private adjustInterests;
    private buildBlacklist;
    private getRecentFeedbackCount;
    private getLastLearningDate;
}
export {};
//# sourceMappingURL=index.d.ts.map