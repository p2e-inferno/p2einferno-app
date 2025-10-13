import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS } from '@/lib/app-config/admin';

const log = getLogger('api:bootcamps:detail');

function invalidateBootcamp(id: string) {
  try {
    revalidateTag(ADMIN_CACHE_TAGS.bootcampList);
    revalidateTag(ADMIN_CACHE_TAGS.bootcamp(id));
  } catch (error) {
    log.warn('bootcamp revalidation failed', { error, id });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Bootcamp ID is required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    const { data, error } = await supabase
      .from('bootcamp_programs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      log.error('bootcamp detail error', { error, id });
      return NextResponse.json({ error: error.message || 'Failed to fetch bootcamp' }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Bootcamp not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('bootcamp detail unexpected error', { error, id });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Bootcamp ID is required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    const { error } = await supabase
      .from('bootcamp_programs')
      .delete()
      .eq('id', id);

    if (error) {
      log.error('bootcamp delete error', { error, id });
      return NextResponse.json({ error: error.message || 'Failed to delete bootcamp' }, { status: 400 });
    }

    invalidateBootcamp(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    log.error('bootcamp delete unexpected error', { error, id });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Bootcamp ID is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    const updates = await req.json();

    // Remove id from updates if it exists (shouldn't update ID)
    const { id: _, ...safeUpdates } = updates;

    const { data, error } = await supabase
      .from('bootcamp_programs')
      .update({
        ...safeUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      log.error('bootcamp update error', { error, id });
      return NextResponse.json(
        { error: error.message || 'Failed to update bootcamp' },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Bootcamp not found' }, { status: 404 });
    }

    invalidateBootcamp(id);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('bootcamp update unexpected error', { error, id });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
