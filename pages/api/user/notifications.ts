import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getPrivyUser(req);

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log(`[NOTIFICATIONS] Looking up profile for user.id: ${user.id}`);

  const supabase = createAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, privy_user_id')
    .eq('privy_user_id', user.id)
    .single();

  if (profileError) {
    console.error(`[NOTIFICATIONS] Profile lookup error:`, profileError);
  }

  if (!profile) {
    console.log(`[NOTIFICATIONS] No profile found for privy_user_id: ${user.id}`);
    
    return res.status(404).json({ error: "User profile not found" });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ notifications: data });
  }

  if (req.method === 'POST') {
    const { notificationIds } = req.body;
    if (!notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({ error: 'Invalid notification IDs' });
    }

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', notificationIds)
      .eq('user_profile_id', profile.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { notificationId } = req.body;
    if (!notificationId || typeof notificationId !== 'string') {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_profile_id', profile.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
} 