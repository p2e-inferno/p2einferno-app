const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMilestones() {
  try {
    const cohortId = 'e0bb0dad-564a-4278-9112-6aa39f6e9f7d';
    
    console.log(`Checking milestones for cohort: ${cohortId}`);
    
    const { data: milestones, error } = await supabase
      .from('cohort_milestones')
      .select('id, name, description, order_index')
      .eq('cohort_id', cohortId)
      .order('order_index', { ascending: true });
      
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log('Found milestones:', milestones?.length || 0);
    console.log('Milestones:', milestones);
    
    // Also check if cohort exists
    const { data: cohort, error: cohortError } = await supabase
      .from('cohorts')
      .select('id, name, status')
      .eq('id', cohortId)
      .single();
      
    if (cohortError) {
      console.error('Cohort error:', cohortError);
    } else {
      console.log('Cohort found:', cohort);
    }
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

checkMilestones();