# Reddit Data API Reapplication

## Short Summary

Spark is a personal, read-only content discovery tool. It fetches public posts from selected subreddits, stores basic post metadata locally, and ranks links for private review.

## Intended API Use

The app will access public subreddit listing and search endpoints for selected subreddits such as r/LocalLLaMA, r/OpenAI, r/ChatGPT, r/artificial, r/MachineLearning, r/programming, r/startups, and r/technology.

The app will only read public post data:

- title
- URL
- permalink
- author username
- score
- comment count
- creation time
- post body when publicly available

The app will not post, comment, vote, message users, moderate communities, collect private data, scrape user profiles, resell Reddit data, or use Reddit data to train AI models.

## Why Devvit Does Not Fit

Devvit is designed for apps that run inside Reddit. This project is an external local CLI workflow that aggregates public links from Reddit together with other public sources and sends private recommendations to my own Feishu workflow. It does not need an in-Reddit UI, subreddit installation, moderation workflow, or Reddit-hosted runtime.

## Data Handling

All data is stored locally in a SQLite database on my own machine or server. Data is used only for personal content research and private recommendations. No public redistribution is planned.

Stored Reddit data can be deleted locally at any time. The app does not store OAuth tokens for other Reddit users and does not ask other Reddit users to authorize access.

## Rate Limits

The app will run periodically, not continuously. It will request a small fixed list of subreddits and use conservative delays between requests. It will respect Reddit API rate limits and back off on errors or rate limit responses.

## Current Fallback

While waiting for API approval, the project uses public subreddit RSS feeds only as a temporary fallback.
