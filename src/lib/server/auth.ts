import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'telas_pin';

/** Token do cookie derivado do PIN: trocar o PIN invalida todos os acessos. */
export function tokenFor(pin: string): string {
	return createHmac('sha256', pin).update('controle-de-telas:v1').digest('hex');
}

function safeEq(a: string, b: string): boolean {
	const x = Buffer.from(a), y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}

export const pinOk = (given: string, pin: string) => safeEq(tokenFor(given), tokenFor(pin));
export const cookieOk = (cookie: string | undefined, pin: string) => !!cookie && safeEq(cookie, tokenFor(pin));

/** Limite de tentativas erradas por origem (em memória). */
export class AttemptLimiter {
	private fails = new Map<string, { n: number; until: number }>();
	constructor(private max = 5, private windowMs = 60_000, private lockMs = 5 * 60_000) {}

	blockedFor(key: string, now = Date.now()): number {
		const f = this.fails.get(key);
		return f && f.until > now ? f.until - now : 0;
	}
	fail(key: string, now = Date.now()) {
		const f = this.fails.get(key);
		const n = f && f.until > now - this.windowMs ? f.n + 1 : 1;
		this.fails.set(key, { n, until: n >= this.max ? now + this.lockMs : now });
	}
	ok(key: string) {
		this.fails.delete(key);
	}
}
