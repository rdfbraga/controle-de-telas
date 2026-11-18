import { error, json } from '@sveltejs/kit';
import { AttemptLimiter, COOKIE, pinOk, tokenFor } from '../../../lib/server/auth';

const limiter = new AttemptLimiter();

export async function POST({ request, cookies, url, getClientAddress }) {
	const pin = process.env.PIN_FAMILIA?.trim();
	if (!pin) return json({ ok: true });
	const who = getClientAddress();
	const wait = limiter.blockedFor(who);
	if (wait) error(429, `Muitas tentativas. Tente de novo em ${Math.ceil(wait / 60000)} min.`);
	const body = await request.json().catch(() => ({}));
	if (!pinOk(String(body.pin ?? ''), pin)) {
		limiter.fail(who);
		error(401, 'PIN incorreto');
	}
	limiter.ok(who);
	cookies.set(COOKIE, tokenFor(pin), {
		path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 60 * 60 * 24 * 365
	});
	return json({ ok: true });
}
