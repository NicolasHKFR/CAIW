import { create } from 'zustand'
import type { ChatMessage, WsMessage, ChatMessageDB } from '../types'
import { createChatSocket, api } from '../api'
import { useProjectStore } from './projectStore'
import { useToastStore } from './toastStore'

interface ChatState {
  messages: ChatMessage[]
  isGenerating: boolean
  status: string | null
  currentWs: WebSocket | null
  loaded: boolean

  sendMessage: (projectId: string, text: string) => void
  cancelGeneration: () => void
  clearMessages: () => void
  loadMessages: (projectId: string) => Promise<void>
}

let counter = 0
function uid() {
  return `msg_${++counter}_${Date.now()}`
}

function dbToChatMessage(m: ChatMessageDB): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.created_at).getTime(),
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isGenerating: false,
  status: null,
  currentWs: null,
  loaded: false,

  cancelGeneration: () => {
    const ws = get().currentWs
    if (ws) {
      ws.close()
      set({ currentWs: null, isGenerating: false, status: 'Cancelled' })
      useToastStore.getState().addToast({ message: 'Generation cancelled', type: 'info' })
    }
  },

  sendMessage: (projectId, text) => {
    const { currentWs, isGenerating } = get()
    if (isGenerating && currentWs) {
      currentWs.close()
    }

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    set((s) => ({
      messages: [...s.messages, userMsg],
      isGenerating: true,
      status: 'Starting...',
    }))

    const onMessage = (msg: WsMessage) => {
      if (msg.event === 'progress') {
        set({ status: msg.message })
      } else if (msg.event === 'complete') {
        const assistantMsg: ChatMessage = {
          id: uid(),
          role: 'assistant',
          content: msg.message,
          timestamp: Date.now(),
          design: msg.design,
          status: 'complete',
        }
        set((s) => ({
          messages: [...s.messages, assistantMsg],
          isGenerating: false,
          status: null,
          currentWs: null,
        }))
        useProjectStore.getState().loadDesigns(projectId)
        useToastStore.getState().addToast({ message: `Design v${msg.design.version} generated!`, type: 'success' })
      } else if (msg.event === 'error') {
        const errMsg: ChatMessage = {
          id: uid(),
          role: 'assistant',
          content: `Error: ${msg.message}`,
          timestamp: Date.now(),
          status: 'error',
        }
        set((s) => ({
          messages: [...s.messages, errMsg],
          isGenerating: false,
          status: null,
          currentWs: null,
        }))
        useToastStore.getState().addToast({ message: msg.message, type: 'error' })
      }
    }

    const ws = createChatSocket(
      projectId,
      text,
      onMessage,
      (err) => {
        console.error('[chatStore] WebSocket error:', err)
      },
      () => {
        const state = get()
        if (state.isGenerating) {
          set({ isGenerating: false, status: null, currentWs: null })
          useToastStore.getState().addToast({ message: 'Connection lost', type: 'error' })
        }
      },
      (newWs) => {
        set({ currentWs: newWs })
      },
    )
    set({ currentWs: ws })
  },

  loadMessages: async (projectId) => {
    try {
      const msgs = await api.listMessages(projectId)
      set({ messages: msgs.map(dbToChatMessage), loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  clearMessages: () => set({ messages: [], isGenerating: false, status: null, currentWs: null, loaded: false }),
}))
