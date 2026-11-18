import { describe, expect, it } from 'vitest';
import { AttemptLimiter, cookieOk, pinOk, tokenFor } from '../src/lib/server/auth';

describe('PIN', () => {
	it('aceita o PIN certo e recusa o errado', () => {
		expect(pinOk('1234', '1234')).toBe(true);
		expect(pinOk('1235', '1234')).toBe(false);
		expect(pinOk('', '1234')).toBe(false);
	});
	it('cookie vale só para o PIN que o gerou', () => {
		expect(cookieOk(tokenFor('1234'), '1234')).toBe(true);
		expect(cookieOk(tokenFor('1234'), '9999')).toBe(false);
		expect(cookieOk(undefined, '1234')).toBe(false);
	});
	it('bloqueia após 5 erros e libera depois do prazo', () => {
		const l = new AttemptLimiter(5, 60_000, 300_000);
		for (let i = 0; i < 5; i++) l.fail('ip', 1000);
		expect(l.blockedFor('ip', 2000)).toBeGreaterThan(0);
		expect(l.blockedFor('ip', 1000 + 300_001)).toBe(0);
		expect(l.blockedFor('outro', 2000)).toBe(0);
	});
});
