import { error, json } from '@sveltejs/kit';
import { getDb } from '../../../lib/server/db';
import { publishChange } from '../../../lib/server/events';
import { addChild, getState } from '../../../lib/server/service';

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	try {
		addChild(getDb(), String(b.name ?? ''), b.template);
	} catch (e) {
		error(400, (e as Error).message);
	}
	publishChange();
	return json(getState(getDb()));
}
