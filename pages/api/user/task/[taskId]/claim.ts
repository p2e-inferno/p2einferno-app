import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();
    const user = await getPrivyUser(req);
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const { taskId } = req.query;
    if (!taskId || typeof taskId !== "string") {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    // Load task with milestone dates
    const { data: task, error: taskErr } = await supabase
      .from('milestone_tasks')
      .select(`id, reward_amount, milestone:milestone_id(id, cohort_id, start_date, end_date)`) 
      .eq('id', taskId)
      .single();
    if (taskErr || !task) return res.status(404).json({ error: 'Task not found' });

    // Get user profile
    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('id, privy_user_id')
      .eq('privy_user_id', user.id)
      .maybeSingle();
    if (profileErr || !profile) return res.status(404).json({ error: 'User profile not found' });

    // Verify user is enrolled in the cohort
    const cohortId = Array.isArray(task.milestone) ? task.milestone[0]?.cohort_id : task.milestone?.cohort_id;
    const { data: enrollment } = await supabase
      .from('bootcamp_enrollments')
      .select('id')
      .eq('user_profile_id', profile.id)
      .eq('cohort_id', cohortId)
      .in('enrollment_status', ['enrolled', 'active'])
      .maybeSingle();
    if (!enrollment) return res.status(403).json({ error: 'Not enrolled in this cohort' });

    // Get task progress for this user
    const { data: utp } = await supabase
      .from('user_task_progress')
      .select('id, status, submission_id, reward_claimed')
      .eq('user_profile_id', profile.id)
      .eq('task_id', taskId)
      .maybeSingle();
    if (!utp) return res.status(400).json({ error: 'Task not completed yet' });
    if (utp.status !== 'completed') return res.status(400).json({ error: 'Task not completed yet' });
    if (utp.reward_claimed) return res.status(400).json({ error: 'Reward already claimed' });

    // Fetch the associated submission to check submitted_at timing
    const { data: submission } = await supabase
      .from('task_submissions')
      .select('id, submitted_at')
      .eq('id', utp.submission_id || '')
      .maybeSingle();

    const milestone = Array.isArray(task.milestone) ? task.milestone[0] : task.milestone;
    const endDate = milestone?.end_date ? new Date(milestone.end_date) : null;
    const submittedAt = submission?.submitted_at ? new Date(submission.submitted_at) : null;

    let eligible = true;
    if (endDate && submittedAt) {
      // Eligible if submission was before or on the deadline, regardless of approval time
      eligible = submittedAt.getTime() <= endDate.getTime();
    }

    if (!eligible) {
      return res.status(400).json({ error: 'Reward eligibility expired' });
    }

    // Mark claimed
    const { error: updateErr } = await supabase
      .from('user_task_progress')
      .update({ reward_claimed: true, updated_at: new Date().toISOString() })
      .eq('id', utp.id);
    if (updateErr) return res.status(500).json({ error: 'Failed to mark reward as claimed' });

    // Increment user XP (experience_points) and log activity
    const rewardAmount: number = task.reward_amount || 0;
    if (rewardAmount > 0) {
      // Get current experience points first
      const { data: currentProfile, error: fetchErr } = await supabase
        .from('user_profiles')
        .select('experience_points')
        .eq('id', profile.id)
        .single();
      
      if (fetchErr) {
        console.error('Failed to fetch current experience points:', fetchErr);
        return res.status(500).json({ error: 'Failed to update experience points' });
      }

      // Update experience points with the new total
      const newExperiencePoints = (currentProfile?.experience_points || 0) + rewardAmount;
      const { error: xpErr } = await supabase
        .from('user_profiles')
        .update({ 
          experience_points: newExperiencePoints,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);
        
      if (xpErr) {
        console.error('Failed to increment experience points:', xpErr);
        return res.status(500).json({ error: 'Failed to update experience points' });
      }

      // Insert activity record (best-effort)
      const { error: actErr } = await supabase
        .from('user_activities')
        .insert({
          user_profile_id: profile.id,
          activity_type: 'bootcamp_task_claimed',
          activity_data: {
            task_id: taskId,
            milestone_id: milestone?.id,
            cohort_id: cohortId,
          },
          points_earned: rewardAmount,
        } as any);
      if (actErr) {
        console.error('Failed to insert user activity:', actErr);
      }
    }

    return res.status(200).json({ success: true, reward_amount: rewardAmount });
  } catch (e: any) {
    console.error('Claim error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}


