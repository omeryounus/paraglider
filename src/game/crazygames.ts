type CrazySdk = {
  init: () => Promise<void>;
  environment?: 'local' | 'crazygames' | 'disabled';
  game?: {
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?: (fn: (s: { muteAudio?: boolean }) => void) => void;
    loadingStart?: () => void;
    loadingStop?: () => void;
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    happytime?: () => void;
    setGameContext?: (ctx: Record<string, string>) => void;
    clearGameContext?: () => void;
    reportGameCompletedPercentage?: (n: number) => void;
  };
  data?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
};

function sdk(): CrazySdk | null {
  const root = (window as unknown as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK;
  return root ?? null;
}

function usable(): boolean {
  const env = sdk()?.environment;
  return env === 'local' || env === 'crazygames' || env === undefined;
}

let ready = false;
let playing = false;

export async function initCrazyGames(): Promise<void> {
  const api = sdk();
  if (!api?.init) return;
  try {
    await api.init();
    ready = usable();
    api.game?.loadingStart?.();
  } catch {
    ready = false;
  }
}

export function loadingStop(): void {
  if (!ready) return;
  try {
    sdk()?.game?.loadingStop?.();
  } catch {
    /* ignore */
  }
}

export function gameplayStart(): void {
  if (!ready) return;
  try {
    sdk()?.game?.gameplayStart?.();
    playing = true;
  } catch {
    /* ignore */
  }
}

export function gameplayStop(): void {
  if (!ready || !playing) return;
  try {
    sdk()?.game?.gameplayStop?.();
    playing = false;
  } catch {
    /* ignore */
  }
}

export function happyTime(): void {
  if (!ready) return;
  try {
    sdk()?.game?.happytime?.();
  } catch {
    /* ignore */
  }
}

export function setGameContext(ctx: Record<string, string>): void {
  if (!ready) return;
  try {
    sdk()?.game?.setGameContext?.(ctx);
  } catch {
    /* ignore */
  }
}

export function clearGameContext(): void {
  if (!ready) return;
  try {
    sdk()?.game?.clearGameContext?.();
  } catch {
    /* ignore */
  }
}

export function reportCompletion(percent: number): void {
  if (!ready) return;
  try {
    sdk()?.game?.reportGameCompletedPercentage?.(Math.max(0, Math.min(100, Math.round(percent))));
  } catch {
    /* ignore */
  }
}

export function bindMuteListener(onMute: (muted: boolean) => void): void {
  const api = sdk();
  if (!ready || !api?.game) return;
  const apply = (settings?: { muteAudio?: boolean }): void => {
    if (settings?.muteAudio) onMute(true);
  };
  apply(api.game.settings);
  api.game.addSettingsChangeListener?.(apply);
}

export function storageGet(key: string): string | null {
  try {
    if (ready && sdk()?.data) return sdk()!.data!.getItem(key);
  } catch {
    /* fall through */
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    if (ready && sdk()?.data) {
      sdk()!.data!.setItem(key, value);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
