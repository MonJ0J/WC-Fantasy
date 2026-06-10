import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserState {
  playerId: string | null;
  displayName: string | null;
  setIdentity: (playerId: string, displayName: string) => void;
  updateName: (displayName: string) => void;
  clear: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      playerId: null,
      displayName: null,
      setIdentity: (playerId, displayName) => set({ playerId, displayName }),
      updateName: (displayName) => set({ displayName }),
      clear: () => set({ playerId: null, displayName: null }),
    }),
    { name: "wc-fantasy-user" },
  ),
);
