#!/usr/bin/env node
/** Read chunk SQL to stdout. Usage: node read-chunk-sql.mjs 10 4 */
import { readSql } from './lib/chunks.mjs';
const part = Number(process.argv[2]);
const chunk = Number(process.argv[3]);
process.stdout.write(readSql(part, chunk));
