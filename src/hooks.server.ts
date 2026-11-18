import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { COOKIE, cookieOk } from './lib/server/auth';

const PUBLIC = new Set(['/entrar', '/api/login', '/manifest.webmanifest', '/icon.svg', '/sw.js']);

export const handle: Handle = async ({ event, resolve }) => {
	const pin = process.env.PIN_FAMILIA?.trim();
	if (!pin) return resolve(event); // sem PIN configurado: acesso livre (uso local)
	if (PUBLIC.has(event.url.pathname) || cookieOk(event.cookies.get(COOKIE), pin)) return resolve(event);
	if (event.url.pathname.startsWith('/api/')) return new Response('{"message":"PIN necessário"}', { status: 401, headers: { 'content-type': 'application/json' } });
	redirect(303, '/entrar');
};
