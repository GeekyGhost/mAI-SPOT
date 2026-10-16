import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api';
import { getModel, editModel, deleteModel } from '@/lib/models';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, { params }: Context) {
  try { return ok({ model: getModel((await params).id) }); } catch { return fail('No such model package', 404); }
}
export async function PUT(request: NextRequest, { params }: Context) {
  try { return ok({ model: editModel((await params).id, await request.json()) }); } catch (error) { return fail(error); }
}
export async function DELETE(_request: NextRequest, { params }: Context) {
  try { deleteModel((await params).id); return ok(); } catch (error) { return fail(error); }
}
