-- 账号画像表
CREATE TABLE IF NOT EXISTS account_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_handle TEXT NOT NULL UNIQUE,
  bio TEXT,
  topics TEXT, -- JSON array
  writing_style TEXT, -- JSON object
  interest_vector TEXT, -- Serialized vector
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tweet_count INTEGER DEFAULT 0
);

-- 内容池表
CREATE TABLE IF NOT EXISTS content_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  url TEXT UNIQUE,
  author TEXT,
  published_at TIMESTAMP,
  metrics TEXT, -- JSON object
  collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  embedding_vector TEXT -- Serialized vector
);

-- 推荐记录表
CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  match_score REAL NOT NULL,
  match_reason TEXT,
  drafts TEXT, -- JSON array
  recommended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, posted
  user_feedback TEXT,
  FOREIGN KEY (content_id) REFERENCES content_pool(id) ON DELETE CASCADE
);

-- 反馈学习表
CREATE TABLE IF NOT EXISTS feedback_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id INTEGER NOT NULL,
  action TEXT NOT NULL, -- approved, rejected, modified, posted
  modified_draft TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_content_pool_url ON content_pool(url);
CREATE INDEX IF NOT EXISTS idx_content_pool_collected_at ON content_pool(collected_at);
CREATE INDEX IF NOT EXISTS idx_recommendations_content_id ON recommendations(content_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);
CREATE INDEX IF NOT EXISTS idx_feedback_log_recommendation_id ON feedback_log(recommendation_id);
