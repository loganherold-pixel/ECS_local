export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  try {
    const maybeNavigator = (globalThis as unknown as { navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } } }).navigator;
    if (maybeNavigator?.clipboard?.writeText) {
      await maybeNavigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the native clipboard path.
  }

  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(value);
    return true;
  } catch {
    return false;
  }
}
