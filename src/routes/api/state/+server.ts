import { json } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db';
import { getState } from '../../../lib/server/service';

export const GET = () => json(getState(getDb()), { headers: { 'cache-control': 'no-store' } });
