import { ok, fail } from '@/lib/api';
import { listModels } from '@/lib/models';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return ok({ models: listModels() }); } catch (error) { return fail(error); }
}
