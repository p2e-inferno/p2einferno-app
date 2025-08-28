const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateCohortPricing() {
  try {
    console.log('Updating Advanced DeFi Mastery - Cohort 1 pricing...');
    
    const { data, error } = await supabase
      .from('cohorts')
      .update({
        usdt_amount: 1,
        naira_amount: 1500,
        updated_at: new Date().toISOString()
      })
      .eq('name', 'Advanced DeFi Mastery - Cohort 1')
      .select()
      .single();

    if (error) {
      console.error('Error updating cohort:', error);
      return;
    }

    console.log('✅ Cohort pricing updated successfully!');
    console.log('Updated cohort:', data);
  } catch (error) {
    console.error('Error:', error);
  }
}

updateCohortPricing();

