import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS } from '@/lib/app-config/admin';

const log = getLogger('api:quests');

function invalidateQuestCache(quest?: { id?: string | null }) {
  try {
    revalidateTag(ADMIN_CACHE_TAGS.questList);
    if (quest?.id) revalidateTag(ADMIN_CACHE_TAGS.quest(String(quest.id)));
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

    // Validate activation quest configuration
    if (reward_type === 'activation') {
      if (!activation_type) {
        return NextResponse.json({ error: 'activation_type is required for activation quests' }, { status: 400 });
      }
      if (activation_type === 'dg_trial') {
        if (!activation_config?.lockAddress) {
          return NextResponse.json({ error: 'activation_config.lockAddress is required for DG trial quests' }, { status: 400 });
        }
        if (!activation_config?.trialDurationSeconds || activation_config.trialDurationSeconds <= 0) {
          return NextResponse.json({ error: 'activation_config.trialDurationSeconds must be a positive number' }, { status: 400 });
        }
      }
    }

    // Harden grant flags
    const grantGrantedFinal =
      typeof lock_manager_granted === 'boolean' ? lock_manager_granted : lock_address ? false : false;
    const grantReasonFinal = grantGrantedFinal ? null : grant_failure_reason || null;

    // Insert quest
    const { data: quest, error: questError } = await supabase
      .from('quests')
      .insert({
        title,
        description,
        image_url,
        total_reward: xp_reward || 0,
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
        activation_config: activation_config || null,
      })
      .select('*')
      .single();
    if (questError) throw questError;

    // Insert tasks if provided
    if (Array.isArray(tasks) && tasks.length > 0) {
      const questTasks = tasks.map((task: any, index: number) => ({
        quest_id: quest.id,
        title: task.title,
        description: task.description,
        task_type: task.task_type,
        verification_method: task.verification_method,
        reward_amount: task.reward_amount || 0,
        order_index: task.order_index ?? index,
        input_required: task.input_required,
        input_label: task.input_label,
        input_placeholder: task.input_placeholder,
        input_validation: task.input_validation,
        requires_admin_review: task.requires_admin_review,
      }));
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
    log.error('quests POST error', { error });
    return NextResponse.json({ error: error?.message || 'Failed to create quest' }, { status: 500 });
  }
}
