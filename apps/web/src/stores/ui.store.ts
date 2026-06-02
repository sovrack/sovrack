import { create } from 'zustand';

type Toast = {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
};

type Modal = {
  id: string;
  isOpen: boolean;
};

type UiState = {
  globalLoading: boolean;
  toasts: Toast[];
  modals: Record<string, boolean>;
};

type UiActions = {
  setGlobalLoading: (loading: boolean) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
  toggleModal: (id: string) => void;
  isModalOpen: (id: string) => boolean;
};

export const useUiStore = create<UiState & UiActions>()((set, get) => ({
  globalLoading: false,
  toasts: [],
  modals: {},

  setGlobalLoading: (loading) => set({ globalLoading: loading }),

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    const duration = toast.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => get().removeToast(id), duration);
    }
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  openModal: (id) =>
    set((state) => ({ modals: { ...state.modals, [id]: true } })),

  closeModal: (id) =>
    set((state) => ({ modals: { ...state.modals, [id]: false } })),

  toggleModal: (id) =>
    set((state) => ({
      modals: { ...state.modals, [id]: !state.modals[id] },
    })),

  isModalOpen: (id) => get().modals[id] ?? false,
}));
