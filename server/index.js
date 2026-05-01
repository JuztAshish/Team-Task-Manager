import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from './db.js';
import { createToken, requireAuth, requireRole } from './auth.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors({ origin: '*'}));
app.use(express.json({ limit: '2mb' }));

function sanitizeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function canAccessProject(user, project) {
  return user.role === 'admin' || project.memberIds.includes(user.sub);
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, role } = req.body ?? {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (db.data.users.some((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ message: 'Email already registered.' });
  }

  const newUser = {
    id: nanoid(),
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(String(password), 10),
    role: role === 'admin' ? 'admin' : 'member',
    createdAt: new Date().toISOString(),
  };
  db.data.users.push(newUser);
  await db.write();

  const token = createToken(newUser);
  return res.status(201).json({ token, user: sanitizeUser(newUser) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.data.users.find((u) => u.email === normalizedEmail);
  if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

  const isValid = await bcrypt.compare(String(password), user.passwordHash);
  if (!isValid) return res.status(401).json({ message: 'Invalid credentials.' });

  const token = createToken(user);
  return res.json({ token, user: sanitizeUser(user) });
});

app.get('/api/users', requireAuth, (req, res) => {
  const users = db.data.users.map(sanitizeUser);
  res.json(users);
});

app.get('/api/projects', requireAuth, (req, res) => {
  const projects = db.data.projects.filter((project) => canAccessProject(req.user, project));
  res.json(projects);
});

app.post('/api/projects', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, description, memberIds = [], dueDate } = req.body ?? {};
  if (!name) return res.status(400).json({ message: 'Project name is required.' });

  const ids = Array.from(
    new Set(
      [req.user.sub, ...memberIds].filter((id) => db.data.users.some((u) => u.id === id))
    )
  );

  const project = {
    id: nanoid(),
    name: String(name).trim(),
    description: String(description || '').trim(),
    ownerId: req.user.sub,
    memberIds: ids,
    dueDate: dueDate || null,
    createdAt: new Date().toISOString(),
  };
  db.data.projects.push(project);
  await db.write();
  res.status(201).json(project);
});

app.get('/api/tasks', requireAuth, (req, res) => {
  const visibleProjectIds = new Set(
    db.data.projects.filter((project) => canAccessProject(req.user, project)).map((p) => p.id)
  );
  const tasks = db.data.tasks.filter((task) => visibleProjectIds.has(task.projectId));
  res.json(tasks);
});

app.post('/api/tasks', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, description, projectId, assigneeId, priority = 'medium', dueDate } = req.body ?? {};
  if (!title || !projectId || !assigneeId) {
    return res.status(400).json({ message: 'Title, project, and assignee are required.' });
  }
  const project = db.data.projects.find((p) => p.id === projectId);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  if (!project.memberIds.includes(assigneeId)) {
    return res.status(400).json({ message: 'Assignee must be a member of the project.' });
  }

  const task = {
    id: nanoid(),
    title: String(title).trim(),
    description: String(description || '').trim(),
    status: 'todo',
    priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
    projectId,
    assigneeId,
    createdBy: req.user.sub,
    dueDate: dueDate || null,
    createdAt: new Date().toISOString(),
  };
  db.data.tasks.push(task);
  await db.write();
  res.status(201).json(task);
});

app.patch('/api/tasks/:id/status', requireAuth, async (req, res) => {
  const task = db.data.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found.' });

  const project = db.data.projects.find((p) => p.id === task.projectId);
  if (!project || !canAccessProject(req.user, project)) {
    return res.status(403).json({ message: 'You cannot edit this task.' });
  }

  if (req.user.role !== 'admin' && task.assigneeId !== req.user.sub) {
    return res.status(403).json({ message: 'Only assignee/admin can update status.' });
  }

  const { status } = req.body ?? {};
  if (!['todo', 'inprogress', 'done'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status.' });
  }

  task.status = status;
  task.updatedAt = new Date().toISOString();
  await db.write();
  res.json(task);
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  const visibleProjectIds = new Set(
    db.data.projects.filter((project) => canAccessProject(req.user, project)).map((p) => p.id)
  );
  const tasks = db.data.tasks.filter((task) => visibleProjectIds.has(task.projectId));
  const now = Date.now();
  const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'done');

  const stats = {
    totalTasks: tasks.length,
    completed: tasks.filter((t) => t.status === 'done').length,
    inProgress: tasks.filter((t) => t.status === 'inprogress').length,
    overdue: overdue.length,
    projects: visibleProjectIds.size,
  };

  res.json({ stats, overdueTasks: overdue.slice(0, 5) });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
