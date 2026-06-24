import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import type { AppSettings, ModelItem } from '../types'
import styles from './SettingsPanel.module.css'

interface Props {
  onClose: () => void
  onSettingsChange?: () => void
}

const PROVIDER_LABELS: Record<string, string> = {
  nvidia: 'NVIDIA',
  ollama: 'Ollama',
  openai: 'OpenAI',
  lmstudio: 'Local (LM Studio)',
}

const PROVIDER_COLORS: Record<string, string> = {
  nvidia: '#76b900',
  ollama: '#00b4d8',
  openai: '#10a37f',
  lmstudio: '#f59e0b',
}

export function SettingsPanel({ onClose, onSettingsChange }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [models, setModels] = useState<ModelItem[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editModel, setEditModel] = useState<ModelItem | null>(null)

  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'error'>>({})
  const [testMessage, setTestMessage] = useState<Record<string, string>>({})

  const [formProvider, setFormProvider] = useState('nvidia')
  const [formModel, setFormModel] = useState('')
  const [formEndpoint, setFormEndpoint] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [discovering, setDiscovering] = useState(false)
  const discoverTimer = useRef<ReturnType<typeof setTimeout>>()
  const [formModelType, setFormModelType] = useState('chat')

  useEffect(() => {
    api.getSettings().then(setSettings)
    loadModels()
  }, [])

  useEffect(() => {
    if (discoverTimer.current) clearTimeout(discoverTimer.current)
    if (!formEndpoint) {
      setAvailableModels([])
      return
    }
    setDiscovering(true)
    discoverTimer.current = setTimeout(async () => {
      try {
        const models = await api.discoverModels(formProvider, formEndpoint)
        setAvailableModels(models)
        if (models.length > 0 && !editModel) {
          setFormModel(models[0])
        }
      } catch {
        if (!editModel) setFormModel('')
      } finally {
        setDiscovering(false)
      }
    }, 600)
    return () => { if (discoverTimer.current) clearTimeout(discoverTimer.current) }
  }, [formProvider, formEndpoint, editModel])

  const loadModels = () => api.listModels().then(setModels)

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await api.updateSettings(settings)
      setSaved(true)
      onSettingsChange?.()
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async (id: string) => {
    await api.activateModel(id)
    await loadModels()
  }

  const handleDelete = async (id: string) => {
    await api.deleteModel(id)
    await loadModels()
  }

  const handleTest = async (id: string) => {
    setTestStatus((s) => ({ ...s, [id]: 'testing' }))
    setTestMessage((s) => ({ ...s, [id]: '' }))
    try {
      const result = await api.testModel(id)
      setTestStatus((s) => ({ ...s, [id]: 'ok' }))
      setTestMessage((s) => ({ ...s, [id]: result.response }))
    } catch (e) {
      setTestStatus((s) => ({ ...s, [id]: 'error' }))
      setTestMessage((s) => ({ ...s, [id]: e instanceof Error ? e.message : 'Connection failed' }))
    }
  }

  const handleAddModel = async () => {
    await api.createModel({
      provider: formProvider,
      model_name: formModel,
      endpoint: formEndpoint,
      api_key: formApiKey,
      model_type: formModelType,
    })
    setShowAdd(false)
    resetForm()
    await loadModels()
  }

  const handleUpdateModel = async () => {
    if (!editModel) return
    await api.updateModel(editModel.id, {
      provider: formProvider,
      model_name: formModel,
      endpoint: formEndpoint,
      model_type: formModelType,
    })
    if (formApiKey) {
      await api.updateModel(editModel.id, { api_key: formApiKey })
    }
    setEditModel(null)
    resetForm()
    await loadModels()
  }

  const openEdit = (m: ModelItem) => {
    setEditModel(m)
    setFormProvider(m.provider)
    setFormModel(m.model_name)
    setFormEndpoint(m.endpoint)
    setFormApiKey('')
    setFormModelType(m.model_type || 'chat')
    setShowAdd(true)
  }

  const resetForm = () => {
    setFormProvider('nvidia')
    setFormModel('')
    setFormEndpoint('')
    setFormApiKey('')
    setFormModelType('chat')
    setAvailableModels([])
  }

  if (!settings) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.body}>
          <label className={styles.field}>
            <span className={styles.label}>Mock Mode</span>
            <input
              type="checkbox"
              checked={settings.mock_mode}
              onChange={(e) => setSettings({ ...settings, mock_mode: e.target.checked })}
            />
          </label>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>LLM Models</span>
              <button
                className={styles.addBtn}
                onClick={() => { setShowAdd(true); setEditModel(null); resetForm() }}
              >
                + Add Model
              </button>
            </div>

            {models.length === 0 && (
              <div className={styles.empty}>No models configured. Add one to start generating.</div>
            )}

            <div className={styles.modelList}>
              {models.map((m) => (
                <div key={m.id} className={`${styles.modelRow} ${m.is_active ? styles.modelActive : ''}`}>
                  <label className={styles.modelRadio} onClick={() => handleActivate(m.id)}>
                    <input
                      type="radio"
                      name="active_model"
                      checked={m.is_active}
                      onChange={() => handleActivate(m.id)}
                    />
                    <span className={styles.modelBadge} style={{ background: PROVIDER_COLORS[m.provider] || '#666' }}>
                      {PROVIDER_LABELS[m.provider] || m.provider}
                    </span>
                    <span className={styles.modelInfo}>
                      <span className={styles.modelName}>{m.model_name}</span>
                      <span className={styles.modelType}>{m.model_type}</span>
                      <span className={styles.modelEndpoint}>{m.endpoint}</span>
                    </span>
                  </label>
                  <div className={styles.modelActions}>
                    <button
                      className={styles.smallBtn}
                      onClick={() => handleTest(m.id)}
                      title="Test connection"
                      disabled={testStatus[m.id] === 'testing'}
                    >
                      {testStatus[m.id] === 'testing' ? '⌛' : testStatus[m.id] === 'ok' ? '✓' : testStatus[m.id] === 'error' ? '✗' : '▶'}
                    </button>
                    <button className={styles.smallBtn} onClick={() => openEdit(m)} title="Edit">
                      ✎
                    </button>
                    <button
                      className={styles.smallBtn}
                      onClick={() => handleDelete(m.id)}
                      title="Delete"
                      disabled={m.is_active}
                    >
                      ×
                    </button>
                  </div>
                  {testMessage[m.id] && (
                    <span className={`${styles.testMsg} ${testStatus[m.id] === 'ok' ? styles.testOk : styles.testFail}`}>
                      {testMessage[m.id]}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {showAdd && (
              <div className={styles.addForm}>
                <div className={styles.formRow}>
                  <select
                    className={styles.input}
                    value={formProvider}
                    onChange={(e) => { setFormProvider(e.target.value); setAvailableModels([]) }}
                  >
                    <option value="nvidia">NVIDIA</option>
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="lmstudio">Local (LM Studio)</option>
                  </select>
                  {availableModels.length > 0 ? (
                    <select
                      className={styles.input}
                      value={formModel}
                      onChange={(e) => setFormModel(e.target.value)}
                    >
                      {availableModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={styles.input}
                      placeholder={
                        discovering ? 'Discovering models...' :
                        formProvider === 'ollama' ? 'Model name (e.g. mistral)' :
                        'Model name (e.g. moonshotai/kimi-k2.6)'
                      }
                      value={formModel}
                      onChange={(e) => setFormModel(e.target.value)}
                      disabled={discovering}
                    />
                  )}
                </div>
                <div className={styles.formRow}>
                  <select
                    className={styles.input}
                    value={formModelType}
                    onChange={(e) => setFormModelType(e.target.value)}
                    title="Model type"
                  >
                    <option value="chat">Chat (default)</option>
                    <option value="tools">Tools (function calling)</option>
                    <option value="reasoning">Reasoning (DeepSeek-style)</option>
                  </select>
                  <span className={styles.inputSpacer} />
                </div>
                <div className={styles.formRow}>
                  <input
                    className={styles.input}
                    placeholder={
                      formProvider === 'lmstudio' ? 'http://localhost:1234' :
                      formProvider === 'ollama' ? 'http://localhost:11434' :
                      formProvider === 'openai' ? 'https://api.openai.com/v1' :
                      'Endpoint URL'
                    }
                    value={formEndpoint}
                    onChange={(e) => setFormEndpoint(e.target.value)}
                  />
                  {formProvider !== 'ollama' && formProvider !== 'lmstudio' && (
                    <input
                      className={styles.input}
                      type="password"
                      placeholder="API key (leave blank to keep existing)"
                      value={formApiKey}
                      onChange={(e) => setFormApiKey(e.target.value)}
                    />
                  )}
                </div>
                <div className={styles.formActions}>
                  <button
                    className={styles.saveBtn}
                    onClick={editModel ? handleUpdateModel : handleAddModel}
                    disabled={!formModel || !formEndpoint}
                  >
                    {editModel ? 'Update' : 'Add'}
                  </button>
                  <button className={styles.cancelBtn} onClick={() => { setShowAdd(false); setEditModel(null) }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <span className={styles.sectionTitle}>Image Generation</span>
            <label className={styles.field}>
              <span className={styles.label}>Image Provider</span>
              <select
                className={styles.select}
                value={settings.image_provider}
                onChange={(e) => setSettings({ ...settings, image_provider: e.target.value })}
              >
                <option value="local_sd">Stable Diffusion (Local)</option>
                <option value="replicate">Replicate</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Image Endpoint</span>
              <input
                className={styles.input}
                value={settings.image_endpoint}
                onChange={(e) => setSettings({ ...settings, image_endpoint: e.target.value })}
              />
            </label>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
