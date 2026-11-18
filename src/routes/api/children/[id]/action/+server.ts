import { error, json } from '@sveltejs/kit';
import { getDb } from '../../../../../lib/server/db';
import { publishChange } from '../../../../../lib/server/events';
import { applyAction, type Action } from '../../../../../lib/server/service';

export async function POST({ params, request }) {
	const b = (await request.json().catch(() => ({}))) as Action;
	try {
		const state = applyAction(getDb(), Number(params.id), b, Date.now());
		publishChange();
		return json(state);
	} catch (e) {
		error(400, (e as Error).message);
	}
}
