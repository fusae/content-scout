export type FailureType =
  | 'auth_required'
  | 'platform_unavailable'
  | 'platform_changed'
  | 'api_quota'
  | 'api_unavailable'
  | 'network'
  | 'unknown';

export interface FailureInfo {
  failureType: FailureType;
  userMessage: string;
  recoverable: boolean;
  actionLabel?: string;
}

export class RecoverableFailure extends Error implements FailureInfo {
  constructor(
    public failureType: FailureType,
    public userMessage: string,
    public recoverable = true,
    public actionLabel?: string
  ) {
    super(userMessage);
    this.name = 'RecoverableFailure';
  }
}

export function classifyFailure(error: unknown, source = ''): FailureInfo {
  if (error instanceof RecoverableFailure) {
    return {
      failureType: error.failureType,
      userMessage: error.userMessage,
      recoverable: error.recoverable,
      actionLabel: error.actionLabel,
    };
  }

  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  const label = source ? `${source} ` : '';
  const apiSource = /deepseek|embedding|dashscope|模型|api/i.test(source);

  if (apiSource && /invalid.*api|api key|authentication|unauthorized|401|403/.test(lower)) {
    return {
      failureType: 'api_unavailable',
      userMessage: `${label}认证失败或配置错误，已降级继续运行`,
      recoverable: false,
      actionLabel: '检查 API Key',
    };
  }

  if (/cookie|login|登录|扫码|signin|session|unauthorized|401|403|z_c0|web_session|sub\b/.test(lower)) {
    return {
      failureType: 'auth_required',
      userMessage: `${label}登录态失效，需要重新登录`,
      recoverable: true,
      actionLabel: '重新登录',
    };
  }

  if (/quota|insufficient|balance|额度|余额|欠费|限额|billing|payment|credits|402|429|too many requests|rate limit/.test(lower)) {
    return {
      failureType: 'api_quota',
      userMessage: '模型 API 额度不足或被限流，已降级继续运行',
      recoverable: false,
      actionLabel: '检查额度',
    };
  }

  if (/selector|dom|captcha|verify|验证|风控|blocked|did not capture|empty response/.test(lower)) {
    return {
      failureType: 'platform_changed',
      userMessage: `${label}页面结构或反爬策略变化，已跳过该平台`,
      recoverable: false,
      actionLabel: '等待适配',
    };
  }

  if (/timeout|econn|enotfound|network|socket|dns|fetch failed/.test(lower)) {
    return {
      failureType: 'network',
      userMessage: `${label}网络异常，稍后会自动重试`,
      recoverable: true,
    };
  }

  if (/5\d\d|server|service unavailable|bad gateway/.test(lower)) {
    return {
      failureType: 'platform_unavailable',
      userMessage: `${label}平台服务暂时不可用，稍后会自动重试`,
      recoverable: true,
    };
  }

  return {
    failureType: 'unknown',
    userMessage: message || `${label}未知错误`,
    recoverable: true,
  };
}
