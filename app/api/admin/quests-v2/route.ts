import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS } from '@/lib/app-config/admin';
import { validateVendorTaskConfig } from '@/lib/quests/vendor-task-config';

const log = getLogger('api:quests');

const DEFAULT_DG_TRIAL_DURATION_SECONDS = 7 * 24 * 60 * 60;

function invalidateQuestCache(quest?: { id?: string | null }) {
  try {
    revalidateTag(ADMIN_CACHE_TAGS.questList, 'default');
    if (quest?.id) revalidateTag(ADMIN_CACHE_TAGS.quest(String(quest.id)), 'default');
  } catch (error) {
    log.warn('quest cache revalidation failed', { error });
  }
}

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    // Fetch quests with tasks
    const { data: questsData, error: questsError } = await supabase
      .from('quests')
      .select('*, quest_tasks(*)')
      .order('created_at', { ascending: false });
    if (questsError) throw questsError;

    // Fetch stats table
    const { data: statsData, error: statsError } = await supabase
      .from('quest_statistics')
      .select('*');
    if (statsError) throw statsError;

    const questsWithStats = (questsData || []).map((quest: any) => {
      const stats = (statsData || []).find((s: any) => s.quest_id === quest.id);
      return {
        ...quest,
        stats: stats
          ? {
            total_users: stats.total_users || 0,
            completed_users: stats.completed_users || 0,
            pending_submissions: stats.pending_submissions || 0,
            completion_rate: stats.completion_rate || 0,
          }
          : undefined,
      };
    });

    return NextResponse.json({ success: true, data: questsWithStats }, { status: 200 });
  } catch (error: any) {
    log.error('quests GET error', { error });
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch quests' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const body = await req.json();
    const {
      title,
      description,
      image_url,
      tasks,
      xp_reward,
      total_reward,
      is_active,
      lock_address,
      lock_manager_granted,
      grant_failure_reason,
      // New fields for prerequisites and activation
      prerequisite_quest_id,
      prerequisite_quest_lock_address,
      requires_prerequisite_key,
      reward_type,
      activation_type,
      activation_config,
    } = body || {};

    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

    let resolvedActivationConfig = activation_config ?? null;

    // Validate activation quest configuration
    if (reward_type === 'activation') {
      if (!activation_type) {
        return NextResponse.json({ error: 'activation_type is required for activation quests' }, { status: 400 });
      }
      if (activation_type === 'dg_trial') {
        const lockAddressValue = activation_config?.lockAddress;
        if (!lockAddressValue) {
          return NextResponse.json({ error: 'activation_config.lockAddress is required for DG trial quests' }, { status: 400 });
        }
        const rawTrialSeconds = activation_config?.trialDurationSeconds;
        const trialDurationSeconds =
          rawTrialSeconds === undefined || rawTrialSeconds === null || rawTrialSeconds === ''
            ? DEFAULT_DG_TRIAL_DURATION_SECONDS
            : Number(rawTrialSeconds);

        if (!Number.isFinite(trialDurationSeconds) || trialDurationSeconds <= 0) {
          return NextResponse.json({ error: 'activation_config.trialDurationSeconds must be a positive number' }, { status: 400 });
        }

        resolvedActivationConfig = {
          ...(activation_config ?? {}),
          lockAddress: lockAddressValue,
          trialDurationSeconds,
        };
      }
    }

    // Harden grant flags
    const grantGrantedFinal =
      typeof lock_manager_granted === 'boolean' ? lock_manager_granted : lock_address ? false : false;
    const grantReasonFinal = grantGrantedFinal ? null : grant_failure_reason || null;

    // Insert quest
    const resolvedTotalReward =
      typeof xp_reward !== "undefined"
        ? Number(xp_reward)
        : typeof total_reward !== "undefined"
          ? Number(total_reward)
          : 0;

    const insertPayload = {
      title,
      description,
      image_url,
      total_reward: Number.isFinite(resolvedTotalReward)
        ? resolvedTotalReward
        : 0,
      is_active,
      lock_address,
      lock_manager_granted: grantGrantedFinal,
      grant_failure_reason: grantReasonFinal,
      // New fields
      prerequisite_quest_id: prerequisite_quest_id || null,
      prerequisite_quest_lock_address: prerequisite_quest_lock_address || null,
      requires_prerequisite_key: requires_prerequisite_key || false,
      reward_type: reward_type || 'xdg',
      activation_type: activation_type || null,
      activation_config: resolvedActivationConfig,
    };

    const { data: quest, error: questError } = await supabase
      .from('quests')
      .insert(insertPayload)
      .select('*')
      .single();

    if (questError) {
      log.error('Quest insert failed', {
        error: questError.message,
        code: questError.code,
        details: questError.details,
        hint: questError.hint,
        insertPayload: reward_type === 'activation' ? insertPayload : { title, reward_type },
      });
      throw questError;
    }

    // Insert tasks if provided
    if (Array.isArray(tasks) && tasks.length > 0) {
      const validation = await validateVendorTaskConfig(tasks);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const questTasks = tasks.map((task: any, index: number) => {
        const rewardAmount = Number(task.reward_amount);
        return {
          quest_id: quest.id,
          title: task.title,
          description: task.description,
          task_type: task.task_type,
          verification_method: task.verification_method,
          reward_amount: Number.isFinite(rewardAmount) ? rewardAmount : 0,
          order_index: task.order_index ?? index,
          task_config: task.task_config || {},
          input_required: task.input_required,
          input_label: task.input_label,
          input_placeholder: task.input_placeholder,
          input_validation: task.input_validation,
          requires_admin_review: task.requires_admin_review,
        };
      });
      const { error: tasksError } = await supabase.from('quest_tasks').insert(questTasks);
      if (tasksError) throw tasksError;
    }

    // Fetch combined
    const { data: fullQuest, error: fetchError } = await supabase
      .from('quests')
      .select('*, quest_tasks(*)')
      .eq('id', quest.id)
      .single();
    if (fetchError) throw fetchError;

    invalidateQuestCache({ id: quest.id });
    return NextResponse.json({ success: true, data: fullQuest, quest: fullQuest }, { status: 201 });
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack;
    const errorDetails = {
      message: errorMessage,
      stack: errorStack,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      errorType: error?.constructor?.name,
    };

    log.error('quests POST error', errorDetails);

    return NextResponse.json({
      error: errorMessage,
      details: error?.details || undefined,
      hint: error?.hint || undefined,
    }, { status: 500 });
  }
}
