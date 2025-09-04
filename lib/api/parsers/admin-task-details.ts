export type IncludeFlags = {
  milestone: boolean;
  cohort: boolean;
  submissions: boolean;
  status?: string;
  limit?: number;
  offset?: number;
};

export const ALLOWED_STATUS = new Set(['pending', 'completed', 'failed', 'retry']);

export function parseIncludeParam(includeParam: string | null, clamp: (n: number | undefined) => number): IncludeFlags {
  const flags: IncludeFlags = { milestone: true, cohort: true, submissions: false };
  if (!includeParam) return flags;

  const parts = includeParam.split(',').map(p => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (p === 'milestone') flags.milestone = true;
    else if (p === 'cohort') flags.cohort = true;
    else if (p === 'submissions') flags.submissions = true;
    else if (p.startsWith('submissions:status=')) {
      const val = p.split('=')[1];
      if (ALLOWED_STATUS.has(val)) flags.status = val;
    }
    else if (p.startsWith('submissions:limit=')) flags.limit = clamp(parseInt(p.split('=')[1], 10));
    else if (p.startsWith('submissions:offset=')) flags.offset = Math.max(0, parseInt(p.split('=')[1], 10) || 0);
  }
  return flags;
}

