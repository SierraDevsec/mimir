import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ClaudeUsage {
  fiveHour?: { utilization: number; resetsAt?: string };
  sevenDay?: { utilization: number; resetsAt?: string };
  sevenDaySonnet?: { utilization: number; resetsAt?: string };
  extraUsage?: {
    isEnabled: boolean;
    monthlyLimit?: number;
    usedCredits?: number;
    utilization?: number;
  };
}

export interface ClaudeAccountInfo {
  email: string;
  displayName: string;
  organizationName: string;
  billingType: string;
  subscriptionType?: string;
  rateLimitTier?: string;
}

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  subscriptionType?: string;
  rateLimitTier?: string;
}

const USAGE_API = "https://api.anthropic.com/api/oauth/usage";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const KEYCHAIN_SERVICE = "Claude Code-credentials";

let cachedTokens: OAuthTokens | null = null;

/** Read OAuth tokens from macOS Keychain, fallback to credentials file */
async function readOAuthTokens(): Promise<OAuthTokens | null> {
  // Try macOS Keychain first
  if (process.platform === "darwin") {
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        execFile(
          "security",
          ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
          { timeout: 5000 },
          (err, stdout) => (err ? reject(err) : resolve(stdout.trim()))
        );
      });
      const parsed = JSON.parse(raw);
      if (parsed.claudeAiOauth) {
        cachedTokens = {
          accessToken: parsed.claudeAiOauth.accessToken,
          refreshToken: parsed.claudeAiOauth.refreshToken,
          expiresAt: parsed.claudeAiOauth.expiresAt,
          subscriptionType: parsed.claudeAiOauth.subscriptionType,
          rateLimitTier: parsed.claudeAiOauth.rateLimitTier,
        };
        return cachedTokens;
      }
    } catch { /* fallback below */ }
  }

  // Fallback: ~/.claude/.credentials.json
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json");
    const raw = await readFile(credPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.claudeAiOauth) {
      cachedTokens = {
        accessToken: parsed.claudeAiOauth.accessToken,
        refreshToken: parsed.claudeAiOauth.refreshToken,
        expiresAt: parsed.claudeAiOauth.expiresAt,
        subscriptionType: parsed.claudeAiOauth.subscriptionType,
        rateLimitTier: parsed.claudeAiOauth.rateLimitTier,
      };
      return cachedTokens;
    }
  } catch { /* no credentials */ }

  return null;
}

/** Refresh the access token if expired */
async function refreshIfNeeded(tokens: OAuthTokens): Promise<OAuthTokens> {
  // 5 minute buffer before expiry
  if (tokens.expiresAt > Date.now() + 5 * 60 * 1000) {
    return tokens;
  }

  let resp: Response;
  try {
    resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: CLIENT_ID,
        scope: "user:profile user:inference user:sessions:claude_code user:mcp_servers",
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    // Network error — clear cache so next attempt re-reads fresh tokens from keychain
    cachedTokens = null;
    throw err;
  }

  if (!resp.ok) {
    // Auth failure — clear cache so next attempt re-reads fresh tokens from keychain
    cachedTokens = null;
    throw new Error(`Token refresh failed: ${resp.status}`);
  }

  const data = (await resp.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const refreshed: OAuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    subscriptionType: tokens.subscriptionType,
    rateLimitTier: tokens.rateLimitTier,
  };
  cachedTokens = refreshed;
  return refreshed;
}

/** Fetch Claude usage data from the API */
export async function fetchClaudeUsage(): Promise<ClaudeUsage | null> {
  let tokens = cachedTokens ?? (await readOAuthTokens());
  if (!tokens) return null;

  tokens = await refreshIfNeeded(tokens);

  const resp = await fetch(USAGE_API, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokens.accessToken}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!resp.ok) {
    // Token may have been revoked; clear cache and retry once
    if (resp.status === 401 && cachedTokens) {
      cachedTokens = null;
      return fetchClaudeUsage();
    }
    throw new Error(`Usage API ${resp.status}`);
  }

  const raw = (await resp.json()) as Record<string, any>;
  const result: ClaudeUsage = {};

  if (raw.five_hour?.utilization != null) {
    result.fiveHour = { utilization: raw.five_hour.utilization, resetsAt: raw.five_hour.resets_at };
  }
  if (raw.seven_day?.utilization != null) {
    result.sevenDay = { utilization: raw.seven_day.utilization, resetsAt: raw.seven_day.resets_at };
  }
  if (raw.seven_day_sonnet?.utilization != null) {
    result.sevenDaySonnet = { utilization: raw.seven_day_sonnet.utilization, resetsAt: raw.seven_day_sonnet.resets_at };
  }
  if (raw.extra_usage) {
    result.extraUsage = {
      isEnabled: raw.extra_usage.is_enabled,
      monthlyLimit: raw.extra_usage.monthly_limit,
      usedCredits: raw.extra_usage.used_credits,
      utilization: raw.extra_usage.utilization,
    };
  }

  return result;
}

/** Read account info from ~/.claude.json */
export async function getClaudeAccountInfo(): Promise<ClaudeAccountInfo | null> {
  try {
    const configPath = join(homedir(), ".claude.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    const acct = config.oauthAccount;
    if (!acct) return null;

    // Also get subscription info from tokens
    const tokens = cachedTokens ?? (await readOAuthTokens());

    return {
      email: acct.emailAddress || "",
      displayName: acct.displayName || "",
      organizationName: acct.organizationName || "",
      billingType: acct.billingType || acct.organizationBillingType || "",
      subscriptionType: tokens?.subscriptionType || undefined,
      rateLimitTier: tokens?.rateLimitTier || undefined,
    };
  } catch {
    return null;
  }
}
