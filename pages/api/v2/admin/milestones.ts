import type { NextApiRequest, NextApiResponse } from 'next';
import { createAdminClient } from '@/lib/supabase/server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createAdminClient();
  try {
    if (req.method === 'GET') {
      const { cohort_id, milestone_id } = req.query as any;
      if (milestone_id) {
        const { data, error } = await supabase.from('cohort_milestones').select('*').eq('id', milestone_id).single();
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ success: true, data });
      }
      if (!cohort_id) return res.status(400).json({ error: 'Missing cohort ID or milestone ID' });
      const { data, error } = await supabase.from('cohort_milestones').select('*').eq('cohort_id', cohort_id).order('order_index');
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true, data });
    }
    if (req.method === 'POST') {
      const { data, error } = await supabase.from('cohort_milestones').insert(req.body).select('*').single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json({ success: true, data });
    }
    if (req.method === 'PUT') {
      const { id, ...update } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing milestone ID' });
      const { data, error } = await supabase.from('cohort_milestones').update({ ...update, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true, data });
    }
    if (req.method === 'DELETE') {
      const { id } = req.query as any;
      if (!id) return res.status(400).json({ error: 'Missing milestone ID' });
      const { error } = await supabase.from('cohort_milestones').delete().eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true });
    }
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error' });
  }
}

