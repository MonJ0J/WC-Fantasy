import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserState {
  playerId: string | null;
  displayName: string | null;
  /** Set when the player has attached a username+password. */
  username: string | null;
  setIdentity: (args: {
    playerId: string;
    displayName: string;
    username?: string | null;
  }) => void;
  updateName: (displayName: string) => void;
  setUsername: (username: string | null) => void;
  clear: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      playerId: null,
      displayName: null,
      username: null,
      setIdentity: ({ playerId, displayName, username }) =>
        set({ playerId, displayName, username: username ?? null }),
      updateName: (displayName) => set({ displayName }),
      setUsername: (username) => set({ username }),
      clear: () => set({ playerId: null, displayName: null, username: null }),
    }),
    { name: "wc-fantasy-user" },
  ),
);
