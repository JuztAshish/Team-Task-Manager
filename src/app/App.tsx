import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  Shield,
  Users,
} from 'lucide-react';

type Role = 'admin' | 'member';
type Status = 'todo' | 'inprogress' | 'done';

type User = { id: string; name: string; email: string; role: Role };
type Project = { id: string; name: string; description: string; dueDate: string | null; memberIds: string[] };
type Task = {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: 'low' | 'medium' | 'high';
  projectId: string;
  assigneeId: string;
  dueDate: string | null;
};
type DashboardData = {
  stats: { totalTasks: number; completed: number; inProgress: number; overdue: number; projects: number };
  overdueTasks: Task[];
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }
  return response.json();
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'team', label: 'Team', icon: Users },
] as const;

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('tm_token'));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('tm_user');
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [page, setPage] = useState<(typeof navItems)[number]['id']>('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [projectForm, setProjectForm] = useState({ name: '', description: '', dueDate: '' });
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    projectId: '',
    assigneeId: '',
    priority: 'medium',
    dueDate: '',
  });

  const memberLookup = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);
  const projectLookup = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);

  const refreshData = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [dashboardData, usersData, projectsData, tasksData] = await Promise.all([
        api<DashboardData>('/api/dashboard', {}, token),
        api<User[]>('/api/users', {}, token),
        api<Project[]>('/api/projects', {}, token),
        api<Task[]>('/api/tasks', {}, token),
      ]);
      setDashboard(dashboardData);
      setUsers(usersData);
      setProjects(projectsData);
      setTasks(tasksData);
      if (!taskForm.projectId && projectsData[0]) {
        setTaskForm((prev) => ({ ...prev, projectId: projectsData[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshData();
  }, [token]);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get('name') || ''),
      email: String(formData.get('email') || ''),
      password: String(formData.get('password') || ''),
      role: String(formData.get('role') || 'member'),
    };
    setAuthLoading(true);
    setAuthError('');
    try {
      const path = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const response = await api<{ token: string; user: User }>(
        path,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      localStorage.setItem('tm_token', response.token);
      localStorage.setItem('tm_user', JSON.stringify(response.user));
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('tm_token');
    localStorage.removeItem('tm_user');
    setToken(null);
    setUser(null);
    setTasks([]);
    setProjects([]);
    setUsers([]);
  };

  const addProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await api(
        '/api/projects',
        {
          method: 'POST',
          body: JSON.stringify({
            ...projectForm,
            memberIds: users.map((u) => u.id),
            dueDate: projectForm.dueDate || null,
          }),
        },
        token
      );
      setProjectForm({ name: '', description: '', dueDate: '' });
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const addTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await api(
        '/api/tasks',
        {
          method: 'POST',
          body: JSON.stringify({
            ...taskForm,
            dueDate: taskForm.dueDate || null,
          }),
        },
        token
      );
      setTaskForm((prev) => ({ ...prev, title: '', description: '', dueDate: '' }));
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  const updateTaskStatus = async (taskId: string, status: Status) => {
    if (!token) return;
    try {
      await api(`/api/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, token);
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  if (!token || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 p-4">
        <div className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-gray-900">Team Task Manager</h1>
          <p className="mt-1 text-sm text-gray-600">Role-based full-stack app (Admin/Member)</p>
          <form onSubmit={handleAuth} className="mt-6 space-y-3">
            {authMode === 'signup' ? (
              <>
                <input name="name" placeholder="Full name" className="w-full rounded-lg border p-2.5" required />
                <select name="role" className="w-full rounded-lg border p-2.5">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </>
            ) : null}
            <input name="email" type="email" placeholder="Email" className="w-full rounded-lg border p-2.5" required />
            <input name="password" type="password" placeholder="Password" className="w-full rounded-lg border p-2.5" required />
            {authError ? <p className="text-sm text-red-600">{authError}</p> : null}
            <button
              type="submit"
              disabled={authLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 p-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {authMode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>
          <button className="mt-4 text-sm text-blue-600" onClick={() => setAuthMode((m) => (m === 'login' ? 'signup' : 'login'))}>
            {authMode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Login'}
          </button>
          <p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Demo credentials: admin@taskflow.com / admin123
            <br />
            member@taskflow.com / member123
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <aside className="h-screen w-64 border-r bg-white p-4">
          <h2 className="mb-1 text-xl font-bold text-blue-700">TaskFlow</h2>
          <p className="mb-5 text-sm text-gray-500">{user.role.toUpperCase()}</p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${active ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <button onClick={logout} className="mt-8 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </aside>

        <main className="flex-1 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold capitalize">{page}</h1>
              <p className="text-sm text-gray-600">Welcome, {user.name}</p>
            </div>
            {loading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : null}
          </div>

          {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

          {page === 'dashboard' && dashboard ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                {[
                  ['Total Tasks', dashboard.stats.totalTasks],
                  ['Completed', dashboard.stats.completed],
                  ['In Progress', dashboard.stats.inProgress],
                  ['Overdue', dashboard.stats.overdue],
                  ['Projects', dashboard.stats.projects],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-white p-4 shadow-sm">
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className="mt-1 text-2xl font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-lg font-semibold">Overdue Tasks</h3>
                <div className="space-y-2">
                  {dashboard.overdueTasks.length ? dashboard.overdueTasks.map((task) => (
                    <div key={task.id} className="rounded-lg border p-3">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-gray-500">{projectLookup[task.projectId] || 'Unknown project'}</p>
                    </div>
                  )) : <p className="text-sm text-gray-500">No overdue tasks.</p>}
                </div>
              </div>
            </div>
          ) : null}

          {page === 'projects' ? (
            <div className="space-y-5">
              {user.role === 'admin' ? (
                <form onSubmit={addProject} className="rounded-xl bg-white p-5 shadow-sm">
                  <h3 className="mb-3 text-lg font-semibold">Create Project</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    <input placeholder="Project name" className="rounded-lg border p-2.5" value={projectForm.name} onChange={(e) => setProjectForm((p) => ({ ...p, name: e.target.value }))} required />
                    <input placeholder="Description" className="rounded-lg border p-2.5" value={projectForm.description} onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))} />
                    <input type="date" className="rounded-lg border p-2.5" value={projectForm.dueDate} onChange={(e) => setProjectForm((p) => ({ ...p, dueDate: e.target.value }))} />
                  </div>
                  <button className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white"><Plus className="h-4 w-4" />Add Project</button>
                </form>
              ) : null}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {projects.map((project) => (
                  <div key={project.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <p className="text-lg font-semibold">{project.name}</p>
                    <p className="mt-1 text-sm text-gray-600">{project.description || 'No description'}</p>
                    <p className="mt-3 text-xs text-gray-500">Due: {project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'N/A'}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {page === 'tasks' ? (
            <div className="space-y-5">
              {user.role === 'admin' ? (
                <form onSubmit={addTask} className="rounded-xl bg-white p-5 shadow-sm">
                  <h3 className="mb-3 text-lg font-semibold">Create Task</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    <input placeholder="Task title" className="rounded-lg border p-2.5" value={taskForm.title} onChange={(e) => setTaskForm((t) => ({ ...t, title: e.target.value }))} required />
                    <input placeholder="Description" className="rounded-lg border p-2.5" value={taskForm.description} onChange={(e) => setTaskForm((t) => ({ ...t, description: e.target.value }))} />
                    <select className="rounded-lg border p-2.5" value={taskForm.projectId} onChange={(e) => setTaskForm((t) => ({ ...t, projectId: e.target.value }))} required>
                      <option value="">Select project</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select className="rounded-lg border p-2.5" value={taskForm.assigneeId} onChange={(e) => setTaskForm((t) => ({ ...t, assigneeId: e.target.value }))} required>
                      <option value="">Select assignee</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <select className="rounded-lg border p-2.5" value={taskForm.priority} onChange={(e) => setTaskForm((t) => ({ ...t, priority: e.target.value }))}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <input type="date" className="rounded-lg border p-2.5" value={taskForm.dueDate} onChange={(e) => setTaskForm((t) => ({ ...t, dueDate: e.target.value }))} />
                  </div>
                  <button className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white"><Plus className="h-4 w-4" />Add Task</button>
                </form>
              ) : null}
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{task.title}</p>
                        <p className="text-sm text-gray-500">{task.description || 'No description'}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          Project: {projectLookup[task.projectId] || 'N/A'} | Assignee: {memberLookup[task.assigneeId] || 'N/A'}
                        </p>
                      </div>
                      <select
                        value={task.status}
                        onChange={(e) => updateTaskStatus(task.id, e.target.value as Status)}
                        disabled={user.role !== 'admin' && task.assigneeId !== user.id}
                        className="rounded-lg border p-2"
                      >
                        <option value="todo">To Do</option>
                        <option value="inprogress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {page === 'team' ? (
            <div className="space-y-3">
              {users.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-sm text-gray-500">{member.email}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${member.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                    {member.role === 'admin' ? <Shield className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
