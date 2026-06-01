type LocalWriteNotifier = () => void;

let localWriteNotifier: LocalWriteNotifier | null = null;

export function registerLocalWriteNotifier(notifier: LocalWriteNotifier): void {
  localWriteNotifier = notifier;
}

export function notifyLocalWrite(): void {
  localWriteNotifier?.();
}
