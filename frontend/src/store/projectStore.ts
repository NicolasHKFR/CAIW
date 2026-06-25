import { create } from 'zustand'
import type { Project, Design, DesignDefinition } from '../types'
import { api } from '../api'

interface ProjectState {
  projects: Project[]
  activeProjectId: string | null
  designs: Design[]
  loading: boolean
  error: string | null

  loadProjects: () => Promise<void>
  createProject: (name: string, prompt: string) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string | null) => void
  loadDesigns: (projectId: string) => Promise<void>
  updateDesignDefinition: (designId: string, definition: DesignDefinition) => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  designs: [],
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await api.listProjects()
      set({ projects, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  createProject: async (name, prompt) => {
    const project = await api.createProject(name, prompt)
    set((s) => ({ projects: [project, ...s.projects] }))
    return project
  },

  deleteProject: async (id) => {
    await api.deleteProject(id)
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
    }))
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  updateDesignDefinition: (designId: string, definition: DesignDefinition) => {
    set((s) => ({
      designs: s.designs.map((d) =>
        d.id === designId ? { ...d, json_definition: definition } : d
      ),
    }))
    const { activeProjectId, designs } = get()
    const design = designs.find((d) => d.id === designId)
    if (activeProjectId && design?.version != null) {
      api.updateDesign(activeProjectId, design.version, definition).catch(() => {})
    }
  },

  loadDesigns: async (projectId) => {
    try {
      const designs = await api.listDesigns(projectId)
      set({ designs })
    } catch (e: any) {
      set({ error: e.message })
    }
  },
}))
