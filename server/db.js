import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const defaultData = {
  users: [],
  projects: [],
  tasks: [],
};

const dbFilePath = fileURLToPath(new URL('./db.json', import.meta.url));
const adapter = new JSONFile(dbFilePath);
export const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;

if (db.data.users.length === 0) {
  const adminId = nanoid();
  const memberId = nanoid();
  db.data.users.push(
    {
      id: adminId,
      name: 'Admin User',
      email: 'admin@taskflow.com',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'admin',
      createdAt: new Date().toISOString(),
    },
    {
      id: memberId,
      name: 'Member User',
      email: 'member@taskflow.com',
      passwordHash: await bcrypt.hash('member123', 10),
      role: 'member',
      createdAt: new Date().toISOString(),
    }
  );

  const projectId = nanoid();
  db.data.projects.push({
    id: projectId,
    name: 'Website Redesign',
    description: 'Revamp landing page and dashboard UI',
    ownerId: adminId,
    memberIds: [adminId, memberId],
    dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  });

  db.data.tasks.push(
    {
      id: nanoid(),
      title: 'Build login page',
      description: 'Create responsive authentication UI and validation',
      status: 'todo',
      priority: 'high',
      projectId,
      assigneeId: memberId,
      createdBy: adminId,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: nanoid(),
      title: 'Setup API middleware',
      description: 'Add auth and role based middleware to Express backend',
      status: 'inprogress',
      priority: 'medium',
      projectId,
      assigneeId: adminId,
      createdBy: adminId,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    }
  );

  await db.write();
}
