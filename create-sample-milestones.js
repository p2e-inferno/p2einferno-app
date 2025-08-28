const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createSampleMilestones() {
  try {
    const cohortId = 'e0bb0dad-564a-4278-9112-6aa39f6e9f7d';
    
    console.log('Creating sample milestones...');
    
    // Create milestones
    const milestones = [
      {
        cohort_id: cohortId,
        name: 'DeFi Fundamentals',
        description: 'Learn the basics of decentralized finance protocols and concepts',
        order_index: 1,
        duration_hours: 10,
        lock_address: '0x0000000000000000000000000000000000000001' // placeholder
      },
      {
        cohort_id: cohortId,
        name: 'Yield Farming Strategies',
        description: 'Master advanced yield farming and liquidity mining techniques',
        order_index: 2,
        duration_hours: 15,
        lock_address: '0x0000000000000000000000000000000000000002'
      },
      {
        cohort_id: cohortId,
        name: 'Risk Management',
        description: 'Learn how to manage risks in DeFi investments and strategies',
        order_index: 3,
        duration_hours: 12,
        lock_address: '0x0000000000000000000000000000000000000003'
      }
    ];
    
    const { data: createdMilestones, error: milestoneError } = await supabase
      .from('cohort_milestones')
      .insert(milestones)
      .select();
      
    if (milestoneError) {
      console.error('Error creating milestones:', milestoneError);
      return;
    }
    
    console.log('Created milestones:', createdMilestones.length);
    
    // Create tasks for each milestone
    const tasks = [];
    
    // Milestone 1 tasks
    tasks.push(
      {
        milestone_id: createdMilestones[0].id,
        title: 'Complete DeFi Basics Course',
        description: 'Watch and complete the introductory course on DeFi fundamentals',
        task_type: 'url_submission',
        reward_amount: 50,
        order_index: 1,
        submission_requirements: { required_url_pattern: 'course' },
        requires_admin_review: false
      },
      {
        milestone_id: createdMilestones[0].id,
        title: 'Write DeFi Summary',
        description: 'Write a 500-word summary of what you learned about DeFi',
        task_type: 'text_submission',
        reward_amount: 75,
        order_index: 2,
        submission_requirements: { min_words: 500 },
        requires_admin_review: true
      }
    );
    
    // Milestone 2 tasks
    tasks.push(
      {
        milestone_id: createdMilestones[1].id,
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
        milestone_id: createdMilestones[1].id,
        title: 'Calculate APY',
        description: 'Calculate and submit the APY for your yield farming strategy',
        task_type: 'text_submission',
        reward_amount: 100,
        order_index: 2,
        submission_requirements: { required_calculation: 'APY' },
        requires_admin_review: true
      }
    );
    
    // Milestone 3 tasks
    tasks.push(
      {
        milestone_id: createdMilestones[2].id,
        title: 'Risk Assessment Report',
        description: 'Submit a comprehensive risk assessment of your DeFi portfolio',
        task_type: 'file_upload',
        reward_amount: 150,
        order_index: 1,
        submission_requirements: { file_types: ['pdf', 'docx'] },
        requires_admin_review: true
      },
      {
        milestone_id: createdMilestones[2].id,
        title: 'Emergency Exit Strategy',
        description: 'Document your emergency exit strategy for high-risk positions',
        task_type: 'text_submission',
        reward_amount: 125,
        order_index: 2,
        submission_requirements: { min_words: 300 },
        requires_admin_review: true
      }
    );
    
    const { data: createdTasks, error: taskError } = await supabase
      .from('milestone_tasks')
      .insert(tasks)
      .select();
      
    if (taskError) {
      console.error('Error creating tasks:', taskError);
      return;
    }
    
    console.log('Created tasks:', createdTasks.length);
    console.log('Sample data creation completed successfully!');
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

createSampleMilestones();