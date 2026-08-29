import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

export const CONFIG_FILES = Object.freeze(['kujo-commerce.yml', 'kujo-commerce.yaml', 'kujo-commerce.json']);

export async function findConfig(siteRoot = '.') {
  const found = [];
  for (const name of CONFIG_FILES) {
    const file = path.resolve(siteRoot, name);
    try { await fs.access(file); found.push(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (found.length > 1) throw new Error(`Commerce configuration is ambiguous: found ${found.map(file => path.basename(file)).join(', ')}. Keep exactly one.`);
  return found[0] || null;
}

export async function loadConfig(siteRoot = '.', { required = true } = {}) {
  const file = await findConfig(siteRoot);
  if (!file) {
    if (!required) return { file: null, config: null };
    throw new Error(`Commerce configuration not found. Expected one of: ${CONFIG_FILES.join(', ')}`);
  }
  let config;
  try {
    const raw = await fs.readFile(file, 'utf8');
    config = file.endsWith('.json') ? JSON.parse(raw) : YAML.parse(raw);
  } catch (error) {
    throw new Error(`${file}: configuration could not be parsed: ${error.message}`);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`${file}: configuration root must be an object.`);
  return { file, config };
}

export function configIssue(file, field, problem, expected, remediation) {
  return { file, field, problem, expected, remediation };
}

export function formatIssues(issues) {
  return issues.map(issue => [
    `Commerce configuration validation failed`,
    `File: ${issue.file || '(configuration)'}`,
    `Field: ${issue.field}`,
    `Problem: ${issue.problem}`,
    issue.expected ? `Expected: ${issue.expected}` : '',
    issue.remediation ? `Remediation: ${issue.remediation}` : ''
  ].filter(Boolean).join('\n  ')).join('\n\n');
}
