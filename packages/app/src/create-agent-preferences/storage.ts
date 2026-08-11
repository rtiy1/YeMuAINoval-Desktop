import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FormPreferences } from "./preferences";

export const CREATE_AGENT_PREFERENCES_STORAGE_KEY = "@yemu:create-agent-preferences";

export interface CreateAgentPreferenceStorage {
  read(): Promise<unknown>;
  write(preferences: FormPreferences): Promise<void>;
}

export class AsyncStorageCreateAgentPreferenceStorage implements CreateAgentPreferenceStorage {
  async read(): Promise<unknown> {
    // COMPAT(createAgentPreferencesKey): legacy key read back once, remove after 2026-11-30.
    const stored =
      (await AsyncStorage.getItem(CREATE_AGENT_PREFERENCES_STORAGE_KEY)) ??
      (await AsyncStorage.getItem("@paseo:create-agent-preferences"));
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  async write(preferences: FormPreferences): Promise<void> {
    await AsyncStorage.setItem(CREATE_AGENT_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }
}
