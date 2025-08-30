const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMilestones() {
  try {
    const cohortId = 'e0bb0dad-564a-4278-9112-6aa39f6e9f7d';
    const failingLockAddress = '0x0C3b451ffa3FEA98a06B492b85a739E8e9772aAB';
    
    console.log(`Checking milestones for cohort: ${cohortId}`);
    console.log(`Looking for failing lock address: ${failingLockAddress}`);
    
    // Check all milestones with lock addresses
    const { data: milestones, error } = await supabase
      .from('cohort_milestones')
      .select('id, name, description, order_index, lock_address')
      .eq('cohort_id', cohortId)
      .order('order_index', { ascending: true });
      
    if (error) {
      console.error('Error:', error);
      return;
    }
    console.log('Milestones:::', milestones);
    console.log('Found milestones:', milestones?.length || 0);
    console.log('Milestones with lock addresses:');
    milestones?.forEach(m => {
      console.log(`- ${m.name} (${m.id})`);
      console.log(`  Lock Address: ${m.lock_address}`);
      console.log(`  Order Index: ${m.order_index}`);
      if (m.lock_address === failingLockAddress) {
        console.log(`  ⚠️  THIS IS THE FAILING LOCK ADDRESS!`);
      }
      console.log('');
    });
    
    // Check if the failing lock address exists anywhere in the database
    const { data: failingLock, error: lockError } = await supabase
      .from('cohort_milestones')
      .select('id, name, cohort_id, lock_address')
      .eq('lock_address', failingLockAddress)
      .maybeSingle();
      
    if (lockError) {
      console.error('Error checking for failing lock:', lockError);
    } else if (failingLock) {
      console.log('Found milestone with failing lock address:');
      console.log(failingLock);
    } else {
      console.log('❌ No milestone found with the failing lock address!');
    }
    
    // Also check if cohort exists
    const { data: cohort, error: cohortError } = await supabase
      .from('cohorts')
      .select('id, name, status, lock_address')
      .eq('id', cohortId)
      .single();
      
    if (cohortError) {
      console.error('Cohort error:', cohortError);
    } else {
      console.log('Cohort found:', cohort);
      console.log('Cohort lock address:', cohort.lock_address);
    }
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

checkMilestones();