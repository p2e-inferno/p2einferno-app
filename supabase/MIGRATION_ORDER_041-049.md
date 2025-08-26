# Migration Order for Milestone Task System (041-049)

**CRITICAL: Apply these migrations in exact order to avoid foreign key type mismatches**

## Migration Sequence:

### **041** - `041_add_task_types_to_milestone_tasks.sql`
- ✅ Adds task_type column to milestone_tasks
- ✅ No foreign key issues

### **042** - `042_enhance_task_submissions_table.sql` 
- ✅ Enhances task_submissions with new columns
- ✅ No foreign key issues

### **043** - `043_create_user_milestone_progress_table.sql`
- ✅ Creates user_milestone_progress table
- ✅ Uses correct TEXT type for milestone_id

### **043_1** - `043_1_ensure_task_submissions_id_is_uuid.sql` 
- 🔧 **CRITICAL FIX** - Ensures task_submissions.id is UUID
- 🎯 **Fixes the issue causing migration 044 to fail**
- ✅ Must run before migration 044

### **044** - `044_create_user_task_progress_table.sql`
- ✅ Creates user_task_progress table  
- ✅ Uses correct types: milestone_id=TEXT, task_id=TEXT, submission_id=UUID
- ⚠️  **Will fail if 043_1 hasn't run first**

### **045** - `045_add_milestone_progress_triggers.sql`
- ✅ Adds trigger functions
- ✅ No foreign key issues

### **046** - `046_fix_milestone_tasks_foreign_key_types.sql`
- 🔧 Fixes milestone_tasks.milestone_id (UUID → TEXT)
- ✅ Handles existing data migration

### **047** - `047_add_contract_interaction_fields_to_milestone_tasks.sql`
- ✅ Adds contract_network, contract_address, contract_method columns
- ✅ No foreign key issues

### **048** - `048_fix_all_milestone_task_foreign_keys.sql`
- 🔧 **COMPREHENSIVE FIX** for milestone_tasks.id and task_submissions.task_id  
- ✅ Converts milestone_tasks.id to TEXT
- ✅ Converts task_submissions.task_id to TEXT
- ⚠️  **Only changes task_id, NOT id column in task_submissions**

### **049** - `049_update_trigger_functions_for_text_ids.sql`
- ✅ Updates trigger functions to handle TEXT IDs correctly
- ✅ No foreign key issues

## Final Schema Types:

```sql
-- TEXT ID Chain (milestone system)
cohort_milestones.id              = TEXT    
├── milestone_tasks.milestone_id  = TEXT    
├── user_milestone_progress.milestone_id = TEXT 

milestone_tasks.id                = TEXT    
├── task_submissions.task_id      = TEXT    
├── user_task_progress.task_id    = TEXT    

-- UUID ID Chain (user system)  
user_profiles.id                  = UUID   
├── user_milestone_progress.user_profile_id = UUID 
├── user_task_progress.user_profile_id = UUID 

-- UUID Primary Keys (internal)
task_submissions.id               = UUID   
├── user_task_progress.submission_id = UUID 
```

## Troubleshooting:

**If migration 044 fails with "submission_id UUID vs TEXT":**
- Run migration 043_1 first to fix task_submissions.id type

**If any migration fails with foreign key type errors:**
- Check that all previous migrations completed successfully
- Verify the exact column types in your database with:
  ```sql
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name IN ('cohort_milestones', 'milestone_tasks', 'task_submissions')
  ORDER BY table_name, column_name;
  ```