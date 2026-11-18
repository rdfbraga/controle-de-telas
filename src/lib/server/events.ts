type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function publishChange() {
	for (const fn of listeners) fn();
}
