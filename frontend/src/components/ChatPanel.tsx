import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../store/chatStore'
import { useProjectStore } from '../store/projectStore'
import styles from './ChatPanel.module.css'

export function ChatPanel() {
  const [input, setInput] = useState('')
  const { messages, isGenerating, status, sendMessage, cancelGeneration } = useChatStore()
  const { activeProjectId, createProject, loadProjects } = useProjectStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isGenerating) return
    setInput('')

    let pid = activeProjectId
    if (!pid) {
      try {
        const name = text.length > 40 ? text.slice(0, 40) + '...' : text
        const project = await createProject(name, text)
        pid = project.id
        useProjectStore.getState().setActiveProject(project.id)
      } catch (e) {
        console.error('[ChatPanel] Failed to create project:', e)
        return
      }
    }

    sendMessage(pid, text)
    loadProjects()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Design Chat</h2>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <p>Describe your dream space.</p>
            <p className={styles.hint}>
              Try: "Create a 90m² modern Japanese apartment, 2 bedrooms, open kitchen"
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.message} ${msg.role === 'user' ? styles.user : styles.assistant}`}
          >
            <div className={styles.bubble}>
              <p className={styles.msgText}>{msg.content}</p>
              {msg.design && (
                <div className={styles.designPreview}>
                  <span className={styles.badge}>
                    v{msg.design.version} · {msg.design.json_definition.style}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
        {isGenerating && status && (
          <div className={`${styles.message} ${styles.assistant}`}>
            <div className={styles.bubble}>
              <p className={styles.status}>{status}</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputBar}>
        <textarea
          className={styles.input}
          placeholder="Describe your design..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isGenerating}
        />
        {isGenerating ? (
          <button className={styles.cancelBtn} onClick={cancelGeneration}>
            Cancel
          </button>
        ) : (
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!input.trim()}
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
