#!/usr/bin/env node
/**
 * Process all pending basketball chunks via Supabase MCP HTTP.
 * Requires SUPABASE_ACCESS_TOKEN in environment or .env
 *
 *   node scripts/basketball-upload/upload-loop.mjs
 *
 * Without token: prints blocked status; use agent CallMcpTool loop instead.
 */
import './upload-loop.mjs';
