import { subscribe } from '../../../lib/server/events';

export function GET({ request }) {
	let unsub = () => {};
	let beat: ReturnType<typeof setInterval>;
	const stream = new ReadableStream({
		start(c) {
			const enc = new TextEncoder();
			const send = (s: string) => {
				try { c.enqueue(enc.encode(s)); } catch { cleanup(); }
			};
			const cleanup = () => { unsub(); clearInterval(beat); };
			send('retry: 2000\n\n');
			unsub = subscribe(() => send('event: change\ndata: 1\n\n'));
			beat = setInterval(() => send(': ping\n\n'), 25_000);
			request.signal.addEventListener('abort', () => { cleanup(); try { c.close(); } catch {} });
		},
		cancel() { unsub(); clearInterval(beat); }
	});
	return new Response(stream, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }
	});
}
