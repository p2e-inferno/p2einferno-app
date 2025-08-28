const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupDuplicates() {
  try {
    const cohortId = 'e0bb0dad-564a-4278-9112-6aa39f6e9f7d';
    
    console.log('Cleaning up duplicate milestones...');
    
    // Get all milestones for this cohort
    const { data: milestones, error } = await supabase
      .from('cohort_milestones')
      .select('id, name, order_index, created_at')
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error fetching milestones:', error);
      return;
    }
    
    // Group by name and order_index to find duplicates
    const groups = {};
    milestones.forEach(milestone => {
      const key = `${milestone.name}_${milestone.order_index}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(milestone);
    });
    
    // Delete duplicates (keep the first one of each group)
    const toDelete = [];
    Object.values(groups).forEach(group => {
      if (group.length > 1) {
        // Keep the first one, delete the rest
        toDelete.push(...group.slice(1).map(m => m.id));
      }
    });
    
    if (toDelete.length > 0) {
      console.log('Deleting duplicate milestones:', toDelete);
      const { error: deleteError } = await supabase
        .from('cohort_milestones')
        .delete()
        .in('id', toDelete);
        
      if (deleteError) {
        console.error('Error deleting duplicates:', deleteError);
        return;
      }
      
      console.log('Deleted', toDelete.length, 'duplicate milestones');
    }
    
    // Get remaining milestones
    const { data: cleanMilestones } = await supabase
      .from('cohort_milestones')
      .select('id, name, order_index')
      .eq('cohort_id', cohortId)
      .order('order_index', { ascending: true });
      
    console.log('Remaining milestones:', cleanMilestones.length);
    cleanMilestones.forEach(m => console.log(`- ${m.name} (${m.id})`));
    
    // Now create tasks for each milestone
    const tasks = [];
    
    // Find each milestone by name
    const defiMilestone = cleanMilestones.find(m => m.name === 'DeFi Fundamentals');
    const yieldMilestone = cleanMilestones.find(m => m.name === 'Yield Farming Strategies');
    const riskMilestone = cleanMilestones.find(m => m.name === 'Risk Management');
    
    if (defiMilestone) {
      tasks.push(
        {
          milestone_id: defiMilestone.id,
          title: 'Complete DeFi Basics Course',
          description: 'Watch and complete the introductory course on DeFi fundamentals',
          task_type: 'url_submission',
          reward_amount: 50,
          order_index: 1,
          submission_requirements: { required_url_pattern: 'course' },
          requires_admin_review: false
        },
        {
          milestone_id: defiMilestone.id,
          title: 'Write DeFi Summary',
          description: 'Write a 500-word summary of what you learned about DeFi',
          task_type: 'text_submission',
          reward_amount: 75,
          order_index: 2,
          submission_requirements: { min_words: 500 },
          requires_admin_review: true
        }
      );
    }
    
    if (yieldMilestone) {
      tasks.push(
        {
          milestone_id: yieldMilestone.id,
          title: 'Deploy Liquidity to Pool',
          description: 'Provide liquidity to a DeFi protocol and submit transaction hash',
          task_type: 'contract_interaction',
          reward_amount: 200,
          order_index: 1,
          submission_requirements: { required_functions: ['addLiquidity', 'deposit'] },
          requires_admin_review: true,
          contract_network: 'base',
          contract_address: '0x4200000000000000000000000000000000000006',
          contract_method: 'addLiquidity'
        },
        {
          milestone_id: yieldMilestone.id,
          title: 'Calculate APY',
          description: 'Calculate and submit the APY for your yield farming strategy',
          task_type: 'text_submission',
          reward_amount: 100,
          order_index: 2,
          submission_requirements: { required_calculation: 'APY' },
          requires_admin_review: true
        }
      );
    }
    
    if (riskMilestone) {
      tasks.push(
        {
          milestone_id: riskMilestone.id,
          title: 'Risk Assessment Report',
          description: 'Submit a comprehensive risk assessment of your DeFi portfolio',
          task_type: 'file_upload',
          reward_amount: 150,
          order_index: 1,
          submission_requirements: { file_types: ['pdf', 'docx'] },
          requires_admin_review: true
        },
        {
          milestone_id: riskMilestone.id,
          title: 'Emergency Exit Strategy',
          description: 'Document your emergency exit strategy for high-risk positions',
          task_type: 'text_submission',
          reward_amount: 125,
          order_index: 2,
          submission_requirements: { min_words: 300 },
          requires_admin_review: true
        }
      );
    }
    
    // Delete existing tasks first
    const { error: deleteTasksError } = await supabase
      .from('milestone_tasks')
      .delete()
      .in('milestone_id', cleanMilestones.map(m => m.id));
    
    if (deleteTasksError) {
      console.log('Warning: Error deleting existing tasks:', deleteTasksError);
    }
    
    // Create new tasks
    const { data: createdTasks, error: taskError } = await supabase
      .from('milestone_tasks')
      .insert(tasks)
      .select();
      
    if (taskError) {
      console.error('Error creating tasks:', taskError);
      return;
    }
    
    console.log('Created tasks:', createdTasks.length);
    console.log('Cleanup completed successfully!');
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

cleanupDuplicates();