import { useState } from 'react'
import { Icon } from './Icons'

const courseTypes = ['programming', 'languages', 'business', 'design', 'data_science', 'marketing', 'finance', 'health', 'other']
const resourceTypes = ['book', 'course', 'video', 'article', 'paper', 'tool', 'website', 'podcast']

export function LearningView({ learning, onUpdate }) {
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState('courses')
  const [newCourse, setNewCourse] = useState({ title: '', type: 'programming', platform: '', progress: 0, rating: 0, hoursTotal: 0, hoursDone: 0, tags: '' })
  const [newTopic, setNewTopic] = useState({ name: '', description: '', priority: 'medium', resources: [] })
  const [newResource, setNewResource] = useState({ title: '', type: 'book', url: '', tags: '', notes: '' })

  const completedCourses = learning.courses.filter(c => c.progress >= 100).length
  const totalHours = learning.courses.reduce((sum, c) => sum + (c.hoursDone || 0), 0)
  const inProgress = learning.courses.filter(c => c.progress > 0 && c.progress < 100).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Learning</h1>
          <p className="text-text-muted">Courses • Topics • Resources • Progress</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2">
          <Icon name="Plus" size={18} />
          Add
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Completed" value={completedCourses} icon="CheckCircle" color="success" />
        <MetricCard label="In Progress" value={inProgress} icon="BookOpen" color="accent" />
        <MetricCard label="Hours Learned" value={totalHours}h icon="Clock" color="warning" />
        <MetricCard label="Resources" value={learning.resources.length} icon="Library" color="success" />
      </div>

      <div className="flex items-center gap-2 border-b border-border mb-4">
        {['courses', 'topics', 'resources', 'progress'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'courses' && <CourseList courses={learning.courses} onUpdate={onUpdate} />}
      {activeTab === 'topics' && <TopicList topics={learning.topics} onUpdate={onUpdate} />}
      {activeTab === 'resources' && <ResourceList resources={learning.resources} onUpdate={onUpdate} />}
      {activeTab === 'progress' && <ProgressView progress={learning.progress} onUpdate={onUpdate} />}

      {showForm && (
        <LearningForm
          mode={activeTab}
          course={newCourse}
          topic={newTopic}
          resource={newResource}
          onCourseChange={setNewCourse}
          onTopicChange={setNewTopic}
          onResourceChange={setNewResource}
          onSubmit={() => {
            if (activeTab === 'courses' && newCourse.title) {
              const c = { ...newCourse, id: `cr-${Date.now()}`, progress: 0, hoursDone: 0, tags: newCourse.tags.split(',').map(t => t.trim()).filter(Boolean) }
              onUpdate({ ...learning, courses: [c, ...learning.courses] })
              setNewCourse({ title: '', type: 'programming', platform: '', progress: 0, rating: 0, hoursTotal: 0, hoursDone: 0, tags: '' })
            } else if (activeTab === 'topics' && newTopic.name) {
              const t = { ...newTopic, id: `tp-${Date.now()}`, created: new Date().toISOString().slice(0,10) }
              onUpdate({ ...learning, topics: [t, ...learning.topics] })
              setNewTopic({ name: '', description: '', priority: 'medium', resources: [] })
            } else if (activeTab === 'resources' && newResource.title) {
              const r = { ...newResource, id: `rs-${Date.now()}`, created: new Date().toISOString().slice(0,10) }
              onUpdate({ ...learning, resources: [r, ...learning.resources] })
              setNewResource({ title: '', type: 'book', url: '', tags: '', notes: '' })
            }
            setShowForm(false)
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function CourseList({ courses, onUpdate }) {
  const handleUpdate = (id, updates) => onUpdate(l => ({ ...l, courses: l.courses.map(c => c.id === id ? { ...c, ...updates } : c) }))
  return (
    <div className="glass p-4 rounded-xl">
      {courses.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="BookOpen" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No courses yet. Start learning something new!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map(c => (
            <CourseCard key={c.id} course={c} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function CourseCard({ course, onUpdate }) {
  return (
    <div className="glass p-4 rounded-lg hover:bg-bg-elevated/50 transition-colors group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-xs px-2 py-0.5 rounded capitalize ${getTypeClass(course.type)}`}>
              {course.type.replace('_', ' ')}
            </span>
            <span className="text-xs text-text-muted">{course.platform}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${getPriorityClass(course.priority || 'medium')}`}>
              {course.priority || 'medium'}
            </span>
          </div>
          <h3 className="font-semibold text-text mb-1 truncate">{course.title}</h3>
          <div className="flex items-center gap-4 text-sm text-text-muted">
            <span>Progress: {course.progress}%</span>
            <span>{course.hoursDone}h / {course.hoursTotal}h</span>
            {course.rating && <span className="text-warning">★ {course.rating}/5</span>}
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden mt-2">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${course.progress}%` }} />
          </div>
          {course.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {course.tags.slice(0, 5).map(tag => (
                <span key={tag} className="px-2 py-0.5 text-xs bg-border rounded text-text-muted">{tag}</span>
              ))}
              {course.tags.length > 5 && <span className="px-2 py-0.5 text-xs bg-border rounded text-text-muted">+{course.tags.length - 5}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-1.5 rounded hover:bg-bg-elevated text-text-muted"><Icon name="Edit" size={14} /></button>
          <button className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
        </div>
      </div>
    </div>
  )
}

function TopicList({ topics, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {topics.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Target" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No topics yet. What do you want to explore?</p>
        </div>
      ) : (
        <div className="space-y-2">
          {topics.map(t => (
            <div key={t.id} className="glass p-3 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-text truncate">{t.name}</h4>
                <p className="text-sm text-text-muted line-clamp-2">{t.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${getPriorityClass(t.priority)}`}>{t.priority}</span>
                  <span className="text-xs text-text-muted">{t.created}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Edit" size={14} /></button>
                <button className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ResourceList({ resources, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl">
      {resources.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Icon name="Library" size={48} className="mx-auto mb-4 opacity-30" />
          <p>No resources saved yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {resources.map(r => (
            <ResourceCard key={r.id} resource={r} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function ResourceCard({ resource, onUpdate }) {
  const handleUpdate = (id, updates) => onUpdate(l => ({ ...l, resources: l.resources.map(r => r.id === id ? { ...r, ...updates } : r) }))
  return (
    <div className="glass p-3 rounded-lg hover:bg-bg-elevated/50 transition-colors group flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
          <Icon name={getResourceIcon(resource.type)} size={20} className="text-accent" />
        </div>
        <div className="min-w-0">
          <h4 className="font-medium text-text truncate">{resource.title}</h4>
          <p className="text-xs text-text-muted flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-border rounded text-text-muted capitalize">{resource.type}</span>
            {resource.tags && resource.tags.length > 0 && (
              <span className="px-1.5 py-0.5 bg-border rounded text-text-muted">{resource.tags.slice(0,3).join(', ')}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {resource.url && <a href={resource.url} target="_blank" rel="noopener" className="p-1.5 rounded hover:bg-bg-elevated text-text-muted"><Icon name="ExternalLink" size={14} /></a>}
        <button className="p-1.5 rounded hover:bg-bg-elevated"><Icon name="Edit" size={14} /></button>
        <button className="p-1.5 rounded hover:bg-danger/10 text-danger"><Icon name="Trash2" size={14} /></button>
      </div>
    </div>
  )
}

function ProgressView({ progress, onUpdate }) {
  return (
    <div className="glass p-4 rounded-xl space-y-6">
      <h3 className="font-semibold text-text">Learning Progress</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium text-text mb-4">Weekly Activity</h4>
          <div className="space-y-2">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-10 text-xs text-text-muted">{day}</span>
                <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-accent/30 rounded-full" style={{ width: `${Math.random()*100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="font-medium text-text mb-4">Monthly Hours</h4>
          <div className="space-y-2">
            {['Week 1','Week 2','Week 3','Week 4'].map((w, i) => (
              <div key={w} className="flex items-center gap-3">
                <span className="w-16 text-xs text-text-muted">{w}</span>
                <div className="flex-1 h-6 bg-border rounded overflow-hidden">
                  <div className="h-full bg-accent rounded" style={{ width: `${20 + Math.random()*60}%` }} />
                </div>
                <span className="w-12 text-xs text-text-muted text-right">{15 + Math.random()*20}h</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function LearningForm({ mode, course, topic, resource, onCourseChange, onTopicChange, onResourceChange, onSubmit, onCancel }) {
  if (mode === 'courses') return <CourseForm course={course} onChange={onCourseChange} onSubmit={onSubmit} onCancel={onCancel} />
  if (mode === 'topics') return <TopicForm topic={topic} onChange={onTopicChange} onSubmit={onSubmit} onCancel={onCancel} />
  if (mode === 'resources') return <ResourceForm resource={resource} onChange={onResourceChange} onSubmit={onSubmit} onCancel={onCancel} />
  return null
}

function CourseForm({ course, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">New Course</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Title *</label>
          <input type="text" value={course.title} onChange={e => onChange({...course, title: e.target.value})} placeholder="TypeScript Deep Dive" className="input" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Type</label>
            <select value={course.type} onChange={e => onChange({...course, type: e.target.value})} className="input">
              {courseTypes.map(t => <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Platform</label>
            <input type="text" value={course.platform} onChange={e => onChange({...course, platform: e.target.value})} placeholder="Coursera, Udemy, YouTube..." className="input" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Total Hours</label>
            <input type="number" value={course.hoursTotal} onChange={e => onChange({...course, hoursTotal: parseInt(e.target.value) || 0})} placeholder="40" className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Hours Done</label>
            <input type="number" value={course.hoursDone} onChange={e => onChange({...course, hoursDone: parseInt(e.target.value) || 0})} placeholder="0" className="input" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Progress %</label>
            <input type="range" min="0" max="100" value={course.progress} onChange={e => onChange({...course, progress: parseInt(e.target.value)})} className="w-full" />
            <span className="text-xs text-text-muted">{course.progress}%</span>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Rating</label>
            <input type="number" step="0.5" min="0" max="5" value={course.rating} onChange={e => onChange({...course, rating: parseFloat(e.target.value) || 0})} placeholder="4.5" className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Tags (comma separated)</label>
          <input type="text" value={course.tags} onChange={e => onChange({...course, tags: e.target.value})} placeholder="react, typescript, hooks" className="input" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!course.title}>Add Course</button>
      </div>
    </div>
  )
}

function TopicForm({ topic, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">New Topic</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Name *</label>
          <input type="text" value={topic.name} onChange={e => onChange({...topic, name: e.target.value})} placeholder="React Server Components" className="input" autoFocus />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Description</label>
          <textarea value={topic.description} onChange={e => onChange({...topic, description: e.target.value})} placeholder="What do you want to learn?" rows={3} className="input resize-y" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Priority</label>
          <select value={topic.priority} onChange={e => onChange({...topic, priority: e.target.value})} className="input">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!topic.name}>Add Topic</button>
      </div>
    </div>
  )
}

function ResourceForm({ resource, onChange, onSubmit, onCancel }) {
  return (
    <div className="glass p-4 rounded-xl space-y-4 border border-accent/30">
      <h3 className="font-semibold text-text">New Resource</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Title *</label>
          <input type="text" value={resource.title} onChange={e => onChange({...resource, title: e.target.value})} placeholder="React Documentation" className="input" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Type</label>
            <select value={resource.type} onChange={e => onChange({...resource, type: e.target.value})} className="input">
              {resourceTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">URL</label>
            <input type="url" value={resource.url} onChange={e => onChange({...resource, url: e.target.value})} placeholder="https://..." className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Tags (comma separated)</label>
          <input type="text" value={resource.tags} onChange={e => onChange({...resource, tags: e.target.value})} placeholder="reference, react, hooks" className="input" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Notes</label>
          <textarea value={resource.notes} onChange={e => onChange({...resource, notes: e.target.value})} placeholder="Why is this useful?" rows={3} className="input resize-y" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-bg-elevated transition-colors">Cancel</button>
        <button onClick={onSubmit} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors" disabled={!resource.title}>Add Resource</button>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon, color }) {
  return (
    <div className="glass p-4 rounded-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-text mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl bg-${color}/10 flex items-center justify-center`}>
          <Icon name={icon} size={24} className={`text-${color}`} />
        </div>
      </div>
    </div>
  )
}

function getTypeClass(type) {
  switch (type) {
    case 'programming': return 'bg-accent/10 text-accent'
    case 'languages': return 'bg-success/10 text-success'
    case 'business': return 'bg-warning/10 text-warning'
    case 'design': return 'bg-purple/10 text-purple'
    case 'data_science': return 'bg-blue/10 text-blue'
    default: return 'bg-border-hover text-text-muted'
  }
}

function getPriorityClass(priority) {
  switch (priority) {
    case 'high': return 'bg-danger/10 text-danger'
    case 'medium': return 'bg-warning/10 text-warning'
    default: return 'bg-border-hover text-text-muted'
  }
}

function getResourceIcon(type) {
  switch (type) {
    case 'book': return 'BookOpen'
    case 'course': return 'GraduationCap'
    case 'video': return 'PlayCircle'
    case 'article': return 'FileText'
    case 'paper': return 'FileText'
    case 'tool': return 'Wrench'
    case 'website': return 'Globe'
    case 'podcast': return 'Mic'
    default: return 'BookOpen'
  }
}