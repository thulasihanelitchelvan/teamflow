"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type User = { id?: string; _id?: string; name: string; email: string };
type RefUser = string | User | null;
type Project = { _id: string; name: string; description: string; owner: RefUser; members: RefUser[]; createdAt?: string; updatedAt?: string };
type Task = { _id: string; project: string; title: string; description: string; status: Status; priority: Priority; priorityRank?: number; assignee: RefUser; creator: RefUser; version: number; dueDate?: string | null; createdAt: string; updatedAt: string };
type Comment = { _id: string; body: string; author: string; authorName: string; createdAt: string };
type Activity = { _id: string; actorName: string; action: string; targetLabel: string; previousValue?: unknown; newValue?: unknown; createdAt: string };
type Dashboard = { total: number; overdue: number; assignedToMe: number; byStatus: Record<Status, number>; activity: Activity[] };
type Status = "Backlog" | "To Do" | "In Progress" | "Done";
type Priority = "Low" | "Medium" | "High" | "Critical";
type ApiResult<T> = { success: boolean } & T;

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
const STATUSES: Status[] = ["Backlog", "To Do", "In Progress", "Done"];
const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];
const initials = (name = "?") => name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("");
const idOf = (value: RefUser | Project | Task | null | undefined): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if ("_id" in value && value._id) return String(value._id);
  if ("id" in value && value.id) return String(value.id);
  return "";
};
const nameOf = (value: RefUser, fallback = "Unassigned") => value && typeof value !== "string" ? value.name : fallback;
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) : "No due date";
const timestamp = (value?: string) => value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const isOverdue = (task: Task) => Boolean(task.dueDate && new Date(task.dueDate).getTime() < Date.now() && task.status !== "Done");

class ApiError extends Error { status: number; code?: string; constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; } }
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...init, credentials: "include", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
  } catch { throw new ApiError("Could not reach the API. Make sure the backend is running on port 5000.", 0); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message || `Request failed (${response.status})`, response.status, data.code);
  return data as T;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [view, setView] = useState<"board" | "list">("board");
  const [modal, setModal] = useState<"task" | "project" | "members" | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectEditing, setProjectEditing] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskStatus, setTaskStatus] = useState<Status>("To Do");
  const [taskPriority, setTaskPriority] = useState<Priority>("Medium");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const isOwner = Boolean(project && idOf(project.owner) === (user?.id || user?._id));
  const activeProjects = projects.length;
  const doneCount = dashboard?.byStatus?.Done || 0;
  const progress = dashboard?.total ? Math.round(doneCount / dashboard.total * 100) : 0;
  const members = useMemo(() => {
    if (!project) return [] as User[];
    const owner = project.owner && typeof project.owner !== "string" ? [project.owner] : [];
    return [...owner, ...(project.members || []).filter((m): m is User => Boolean(m && typeof m !== "string"))];
  }, [project]);

  const showToast = useCallback((text: string, type: "success" | "error" = "success") => {
    setMessage(text); setMessageType(type);
    window.setTimeout(() => setMessage(""), 3800);
  }, []);

  const loadProjects = useCallback(async (preferredId?: string) => {
    const result = await api<ApiResult<{ projects: Project[] }>>("/projects");
    setProjects(result.projects);
    const next = result.projects.find((p) => p._id === preferredId) || result.projects.find((p) => p._id === project?._id) || result.projects[0] || null;
    setProject(next);
    return next;
  }, [project?._id]);

  const loadProjectData = useCallback(async (target: Project, params?: { page?: number; silent?: boolean }) => {
    const query = new URLSearchParams();
    query.set("page", String(params?.page || pagination.page)); query.set("limit", String(pagination.limit));
    if (search.trim()) query.set("search", search.trim());
    if (statusFilter !== "all") query.set("status", statusFilter);
    if (priorityFilter !== "all") query.set("priority", priorityFilter);
    if (assigneeFilter !== "all") query.set("assignee", assigneeFilter);
    if (overdueOnly) query.set("overdue", "true");
    query.set("sortBy", sortBy); query.set("order", sortOrder);
    const urlParams = new URLSearchParams(query); urlParams.delete("limit");
    const nextUrl = `${window.location.pathname}?project=${target._id}&${urlParams.toString()}`;
    window.history.replaceState({}, "", nextUrl);
    setLoadingTasks(true);
    if (!params?.silent) setBusy(true);
    try {
      const [taskData, dashData] = await Promise.all([
        api<ApiResult<{ tasks: Task[]; pagination: typeof pagination }>>(`/projects/${target._id}/tasks?${query.toString()}`),
        api<ApiResult<{ dashboard: Dashboard }>>(`/projects/${target._id}/dashboard`),
      ]);
      setTasks(taskData.tasks); setPagination(taskData.pagination); setDashboard(dashData.dashboard);
      if (taskData.pagination.page > taskData.pagination.pages) setPagination((previous) => ({ ...previous, page: taskData.pagination.pages }));
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not load project", "error"); }
    finally { setLoadingTasks(false); if (!params?.silent) setBusy(false); }
  }, [pagination.page, pagination.limit, search, statusFilter, priorityFilter, assigneeFilter, overdueOnly, sortBy, sortOrder, showToast]);

  const refresh = useCallback(async (preferredId?: string) => {
    try {
      const target = await loadProjects(preferredId);
      if (target) await loadProjectData(target, { page: 1, silent: true });
      else { setTasks([]); setDashboard(null); }
    } catch (error) { if (error instanceof ApiError && error.status === 401) setUser(null); else showToast(error instanceof Error ? error.message : "Unable to refresh", "error"); }
  }, [loadProjects, loadProjectData, showToast]);

  useEffect(() => {
    let mounted = true;
    // Restore task filters and page from the URL so links can be shared/reloaded.
    const initial = new URLSearchParams(window.location.search);
    const initialPage = Math.max(1, Number(initial.get("page")) || 1);
    const requestedProject = initial.get("project") || undefined;
    const restoreTimer = window.setTimeout(() => {
      setSearch(initial.get("search") || "");
      setStatusFilter(initial.get("status") || "all");
      setPriorityFilter(initial.get("priority") || "all");
      setAssigneeFilter(initial.get("assignee") || "all");
      setOverdueOnly(initial.get("overdue") === "true");
      setSortBy(initial.get("sortBy") || "createdAt");
      setSortOrder(initial.get("order") || "desc");
      setPagination((previous) => ({ ...previous, page: initialPage }));
    }, 0);
    api<ApiResult<{ user: User }>>("/auth/me").then((r) => {
      if (!mounted) return; setUser(r.user); return loadProjects(requestedProject);
    }).then((p) => { if (mounted && p) return loadProjectData(p, { page: initialPage, silent: true }); }).catch(() => undefined).finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; window.clearTimeout(restoreTimer); };
    // Initial session probe and URL restoration only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || !project) return;
    const timer = window.setTimeout(() => { void loadProjectData(project, { page: pagination.page, silent: true }); }, 240);
    return () => window.clearTimeout(timer);
  }, [user, project?._id, search, statusFilter, priorityFilter, assigneeFilter, overdueOnly, sortBy, sortOrder, pagination.page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (authMode === "register") {
        await api("/auth/register", { method: "POST", body: JSON.stringify({ name: authName, email: authEmail, password: authPassword }) });
        showToast("Account created. Sign in to open your workspace."); setAuthMode("login"); setAuthPassword("");
      } else {
        const result = await api<ApiResult<{ user: User }>>("/auth/login", { method: "POST", body: JSON.stringify({ email: authEmail, password: authPassword }) });
        setUser(result.user); setAuthPassword(""); await refresh(); showToast(`Welcome back, ${result.user.name.split(" ")[0]}.`);
      }
    } catch (error) { showToast(error instanceof Error ? error.message : "Authentication failed", "error"); }
    finally { setBusy(false); setReady(true); }
  }
  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); } catch { /* still clear local view; server may have expired the session */ }
    setUser(null); setProjects([]); setProject(null); setDashboard(null); setTasks([]); setShowProfileMenu(false); setMessage("");
    window.history.replaceState({}, "", window.location.pathname); showToast("You have been signed out.");
  }

  function openCreateTask(task?: Task) {
    setEditTask(task || null); setTaskTitle(task?.title || ""); setTaskDescription(task?.description || ""); setTaskStatus(task?.status || "To Do"); setTaskPriority(task?.priority || "Medium"); setTaskAssignee(idOf(task?.assignee) || ""); setTaskDueDate(task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ""); setModal("task");
  }
  function openProjectModal(edit = false) {
    setProjectEditing(edit);
    setProjectName(edit && project ? project.name : ""); setProjectDescription(edit && project ? project.description : ""); setModal("project");
  }
  async function submitProject(event: FormEvent) {
    event.preventDefault(); if (!projectName.trim()) return;
    setBusy(true);
    try {
      const result = projectEditing && project ? await api<ApiResult<{ project: Project }>>(`/projects/${project._id}`, { method: "PATCH", body: JSON.stringify({ name: projectName, description: projectDescription }) }) : await api<ApiResult<{ project: Project }>>("/projects", { method: "POST", body: JSON.stringify({ name: projectName, description: projectDescription }) });
      const newProject = result.project; setModal(null); await refresh(newProject._id); showToast(projectEditing ? "Project settings saved" : "Project created");
    } catch (error) { showToast(error instanceof Error ? error.message : "Could not save project", "error"); }
    finally { setBusy(false); }
  }
  async function submitTask(event: FormEvent) {
    event.preventDefault(); if (!project || !taskTitle.trim()) return; setBusy(true);
    const dueDate = taskDueDate ? new Date(`${taskDueDate}T23:59:59.999Z`).toISOString() : null;
    try {
      if (editTask) {
        const body: Record<string, unknown> = { version: editTask.version, title: taskTitle, description: taskDescription, status: taskStatus, priority: taskPriority, dueDate };
        if (isOwner) body.assignee = taskAssignee || null;
        await api(`/tasks/${editTask._id}`, { method: "PATCH", body: JSON.stringify(body) });
        showToast("Task updated");
      } else {
        const body: Record<string, unknown> = { title: taskTitle, description: taskDescription, status: taskStatus, priority: taskPriority, dueDate };
        if (isOwner && taskAssignee) body.assignee = taskAssignee;
        await api(`/projects/${project._id}/tasks`, { method: "POST", body: JSON.stringify(body) }); showToast("Task created");
      }
      setModal(null); setEditTask(null); await loadProjectData(project, { page: pagination.page, silent: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) { showToast("This task changed elsewhere. Reload the latest version before editing again.", "error"); await loadProjectData(project, { page: pagination.page, silent: true }); }
      else showToast(error instanceof Error ? error.message : "Could not save task", "error");
    } finally { setBusy(false); }
  }
  async function changeStatus(task: Task, status: Status) {
    try { await api(`/tasks/${task._id}`, { method: "PATCH", body: JSON.stringify({ version: task.version, status }) }); if (project) await loadProjectData(project, { page: pagination.page, silent: true }); showToast(`Moved to ${status}`); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not update status", "error"); if (project) await loadProjectData(project, { page: pagination.page, silent: true }); }
  }
  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete “${task.title}”? This action cannot be undone.`)) return;
    try { await api(`/tasks/${task._id}`, { method: "DELETE" }); setDetailTask(null); showToast("Task deleted"); if (project) await loadProjectData(project, { page: pagination.page, silent: true }); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not delete task", "error"); }
  }
  async function openDetails(task: Task) {
    setDetailTask(task); setComments([]);
    try { const result = await api<ApiResult<{ task: Task; comments: Comment[] }>>(`/tasks/${task._id}`); setDetailTask(result.task); setComments(result.comments); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not load task", "error"); }
  }
  async function submitComment(event: FormEvent) {
    event.preventDefault(); if (!detailTask || !commentText.trim()) return;
    setCommentBusy(true);
    try { const result = await api<ApiResult<{ comment: Comment }>>(`/tasks/${detailTask._id}/comments`, { method: "POST", body: JSON.stringify({ body: commentText }) }); setComments((old) => [...old, result.comment]); setCommentText(""); showToast("Comment added"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not add comment", "error"); }
    finally { setCommentBusy(false); }
  }
  async function deleteComment(comment: Comment) {
    if (!window.confirm("Delete this comment?")) return;
    try { await api(`/comments/${comment._id}`, { method: "DELETE" }); setComments((old) => old.filter((c) => c._id !== comment._id)); showToast("Comment deleted"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not delete comment", "error"); }
  }
  async function addMember(event: FormEvent) {
    event.preventDefault(); if (!project || !memberEmail.trim()) return; setBusy(true);
    try { await api(`/projects/${project._id}/members`, { method: "POST", body: JSON.stringify({ email: memberEmail }) }); setMemberEmail(""); await refresh(project._id); showToast("Member added to project"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not add member", "error"); }
    finally { setBusy(false); }
  }
  async function removeMember(member: User) {
    if (!project || !window.confirm(`Remove ${member.name} from this project? Their assignments will be cleared.`)) return;
    try { await api(`/projects/${project._id}/members/${idOf(member)}`, { method: "DELETE" }); await refresh(project._id); showToast(`${member.name} removed`); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not remove member", "error"); }
  }

  if (!ready) return <div className="boot-screen"><div className="brand-mark pulse">T</div><p>Preparing your workspace…</p></div>;
  if (!user) return <main className="auth-shell">
    <div className="auth-art"><div className="auth-art-glow glow-one"/><div className="auth-art-glow glow-two"/><div className="auth-art-content"><div className="brand-lockup light"><div className="brand-mark">T</div><span>teamflow<span className="brand-dot">.</span></span></div><div className="auth-headline">Less chasing.<br/><em>More making.</em></div><p className="auth-subtitle">A calmer place for teams to plan work, share progress and move projects forward.</p><div className="floating-preview"><div className="preview-top"><span className="mini-dot purple"/><span className="mini-dot orange"/><span className="mini-dot green"/><span className="preview-label">SPRINT OVERVIEW</span><span className="preview-live">● LIVE</span></div><div className="preview-task"><span className="preview-check">✓</span><div><b>Polish onboarding flow</b><small>Product design · Today</small></div><span className="preview-avatar">AM</span></div><div className="preview-task"><span className="preview-check hollow"/><div><b>API integration</b><small>Engineering · Tomorrow</small></div><span className="preview-avatar blue">JK</span></div><div className="preview-progress"><div><span>Weekly progress</span><b>78%</b></div><div className="progress-track"><div style={{ width: "78%" }}/></div></div></div><div className="auth-footer-note"><span>✳</span> Built for thoughtful teams that do their best work together.</div></div></div>
    <section className="auth-panel"><div className="auth-panel-inner"><div className="auth-mobile-brand brand-lockup"><div className="brand-mark">T</div><span>teamflow<span className="brand-dot">.</span></span></div><div className="auth-eyebrow">YOUR TEAM, IN SYNC</div><h1>{authMode === "login" ? "Welcome back" : "Create your account"}</h1><p className="auth-intro">{authMode === "login" ? "Pick up where your team left off." : "Start turning your team's plans into progress."}</p>
      <form className="auth-form" onSubmit={submitAuth}>
        {authMode === "register" && <label>Full name<input autoComplete="name" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Alex Morgan" required maxLength={100}/></label>}
        <label>Work email<input type="email" autoComplete="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@company.com" required maxLength={254}/></label>
        <label>Password<input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder={authMode === "register" ? "At least 12 characters" : "Enter your password"} required minLength={authMode === "register" ? 12 : 1} maxLength={128}/></label>
        <button className="button primary auth-submit" disabled={busy}>{busy ? <span className="spinner"/> : null}{authMode === "login" ? "Sign in to TeamFlow" : "Create account"}<span className="button-arrow">↗</span></button>
      </form>
      <div className="auth-switch">{authMode === "login" ? "New to TeamFlow?" : "Already have an account?"}<button onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setMessage(""); }}>{authMode === "login" ? "Create an account" : "Sign in"}</button></div>
      <div className="auth-security"><span>▣</span> Your workspace is protected by secure sessions.</div>
    </div></section>
    {message && <div className={`toast ${messageType}`}>{messageType === "error" ? "!" : "✓"} {message}</div>}
  </main>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup sidebar-brand"><div className="brand-mark">T</div><span>teamflow<span className="brand-dot">.</span></span></div>
      <div className="workspace-switch"><div className="workspace-icon">P</div><div className="workspace-copy"><b>Purples</b><small>Free workspace</small></div><span className="chevron">⌄</span></div>
      <div className="side-label">WORKSPACE</div>
      <button className="side-link active"><span className="nav-icon">▦</span> Overview <span className="side-count">⌘1</span></button>
      <button className="side-link" onClick={() => document.getElementById("tasks-section")?.scrollIntoView({ behavior: "smooth" })}><span className="nav-icon">☷</span> My tasks</button>
      <button className="side-link" onClick={() => { setView("board"); document.getElementById("tasks-section")?.scrollIntoView({ behavior: "smooth" }); }}><span className="nav-icon">⊞</span> Board</button>
      <div className="side-section-head"><span className="side-label">YOUR PROJECTS</span><button className="tiny-icon" title="Create project" onClick={() => openProjectModal(false)}>＋</button></div>
      <div className="project-nav-list">{projects.map((item, index) => <button key={item._id} className={`project-nav ${project?._id === item._id ? "selected" : ""}`} onClick={() => { setProject(item); setPagination((p) => ({ ...p, page: 1 })); }}><span className={`project-color color-${index % 4}`}>{item.name.slice(0, 1).toUpperCase()}</span><span className="project-nav-name">{item.name}</span>{project?._id === item._id && <span className="selected-indicator"/>}</button>)}</div>
      <button className="new-project-link" onClick={() => openProjectModal(false)}><span>＋</span> New project</button>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-spark">✳</div><b>Need a hand?</b><p>Great work is a team effort. Keep everyone in the loop.</p><button onClick={() => showToast("Tip: use project members and activity to keep work in sync.")}>Quick tips <span>↗</span></button></div><div className="sidebar-user"><div className="avatar avatar-user">{initials(user.name)}</div><div className="sidebar-user-copy"><b>{user.name}</b><small>{user.email}</small></div><button className="tiny-icon user-menu-btn" onClick={() => setShowProfileMenu(!showProfileMenu)} aria-label="Profile menu">•••</button>{showProfileMenu && <div className="profile-menu"><button onClick={() => showToast(`${user.name} · ${user.email}`)}>My profile</button><button onClick={logout}>Sign out</button></div>}</div></div>
    </aside>

    <main className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{project?.name || "Overview"}</strong></div><div className="topbar-actions"><span className="today-label">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span><button className="topbar-icon" title="Refresh data" onClick={() => void refresh(project?._id)}>↻</button><button className="topbar-icon notification-button" title="Notifications" onClick={() => showToast("You're all caught up.")}>♧<i/></button><div className="avatar top-avatar">{initials(user.name)}</div></div></header>
      <div className="page-content">
        <section className="welcome-row"><div><div className="greeting-eyebrow"><span className="greeting-spark">✳</span> YOUR TEAM AT A GLANCE</div><h1>{getGreeting()}, {user.name.split(" ")[0]}<span className="heading-period">.</span></h1><p className="page-subtitle">Here&apos;s what&apos;s moving across your projects today.</p></div><div className="welcome-actions"><button className="button secondary" onClick={() => setModal("members")} disabled={!project}><span>♙</span> Members</button><button className="button primary" onClick={() => openCreateTask()} disabled={!project}><span>＋</span> New task</button></div></section>
        {!project ? <section className="empty-project-card"><div className="empty-illustration">✳</div><h2>Your next great project starts here</h2><p>Create a project, invite your team, and bring your work into one calm place.</p><button className="button primary" onClick={() => openProjectModal(false)}>＋ Create your first project</button></section> : <>
          <section className="project-banner"><div className="project-banner-main"><div className="project-big-icon">{project.name.slice(0, 1).toUpperCase()}</div><div><div className="project-heading-line"><h2>{project.name}</h2><span className="active-tag"><i/> Active</span></div><p>{project.description || "A shared space to move ideas into action."}</p></div></div><div className="project-banner-side"><div className="avatars-stack">{members.slice(0, 4).map((m, i) => <div className={`avatar member-avatar avatar-tone-${i % 4}`} key={idOf(m) || m.email} title={m.name}>{initials(m.name)}</div>)}{members.length > 4 && <div className="avatar more-avatar">+{members.length - 4}</div>}</div><span className="member-label">{members.length} {members.length === 1 ? "member" : "members"}</span><span className="banner-divider"/>{isOwner && <button className="tiny-icon banner-settings" aria-label="Project settings" title="Project settings" onClick={() => openProjectModal(true)}>⚙</button>}</div></section>
          <section className="flow-panel panel" aria-labelledby="flow-title">
            <div className="flow-panel-heading">
              <div>
                <span className="panel-eyebrow">WORKFLOW MAP</span>
                <h3 id="flow-title">How work moves <span className="flow-heading-dot" /></h3>
                <p>One connected view from first idea to shipped work.</p>
              </div>
              <div className="flow-heading-meta"><span className="flow-live"><i /> Project flow</span><span className="flow-heading-divider" />{members.length} collaborators</div>
            </div>
            <div className="flow-canvas" aria-label="Project workflow by status">
              <svg className="flow-connections" viewBox="0 0 1000 190" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="flowPathOne" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#2687e8"/><stop offset="100%" stopColor="#54c0f5"/></linearGradient>
                  <linearGradient id="flowPathTwo" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ff6b83"/><stop offset="100%" stopColor="#ffad68"/></linearGradient>
                  <linearGradient id="flowPathThree" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#7b6bff"/><stop offset="100%" stopColor="#ca66ed"/></linearGradient>
                </defs>
                <path className="flow-path path-blue" d="M 178 64 C 218 64, 218 126, 255 126 S 292 64, 333 64" />
                <path className="flow-path path-coral" d="M 423 126 C 462 126, 462 64, 505 64 S 545 126, 590 126" />
                <path className="flow-path path-violet" d="M 680 64 C 720 64, 720 126, 760 126 S 800 64, 843 64" />
                <circle cx="255" cy="126" r="5" className="flow-anchor anchor-blue"/><circle cx="505" cy="64" r="5" className="flow-anchor anchor-coral"/><circle cx="760" cy="126" r="5" className="flow-anchor anchor-violet"/>
              </svg>
              <div className="flow-nodes">
                <article className="flow-node flow-node-backlog">
                  <div className="flow-node-top"><span className="flow-node-icon">✳</span><span className="flow-node-index">01</span></div>
                  <span className="flow-node-kicker">IDEAS & INTAKE</span><h4>Backlog</h4>
                  <div className="flow-node-bottom"><span>{dashboard?.byStatus?.Backlog ?? 0} tasks waiting</span><span className="flow-node-arrow">↗</span></div>
                  <div className="flow-node-progress"><span style={{ width: `${dashboard?.total ? Math.min(100, (dashboard.byStatus?.Backlog || 0) / dashboard.total * 100) : 0}%` }} /></div>
                </article>
                <article className="flow-node flow-node-todo">
                  <div className="flow-node-top"><span className="flow-node-icon">◷</span><span className="flow-node-index">02</span></div>
                  <span className="flow-node-kicker">UP NEXT</span><h4>To Do</h4>
                  <div className="flow-node-bottom"><span>{dashboard?.byStatus?.["To Do"] ?? 0} ready to start</span><span className="flow-node-arrow">↗</span></div>
                  <div className="flow-node-progress"><span style={{ width: `${dashboard?.total ? Math.min(100, (dashboard.byStatus?.["To Do"] || 0) / dashboard.total * 100) : 0}%` }} /></div>
                </article>
                <article className="flow-node flow-node-progressing">
                  <div className="flow-node-top"><span className="flow-node-icon">↗</span><span className="flow-node-index">03</span></div>
                  <span className="flow-node-kicker">IN MOTION</span><h4>In Progress</h4>
                  <div className="flow-node-bottom"><span>{dashboard?.byStatus?.["In Progress"] ?? 0} moving forward</span><span className="flow-node-arrow">↗</span></div>
                  <div className="flow-node-progress"><span style={{ width: `${dashboard?.total ? Math.min(100, (dashboard.byStatus?.["In Progress"] || 0) / dashboard.total * 100) : 0}%` }} /></div>
                </article>
                <article className="flow-node flow-node-done">
                  <div className="flow-node-top"><span className="flow-node-icon">✓</span><span className="flow-node-index">04</span></div>
                  <span className="flow-node-kicker">DELIVERED</span><h4>Done</h4>
                  <div className="flow-node-bottom"><span>{dashboard?.byStatus?.Done ?? 0} across the line</span><span className="flow-node-arrow">↗</span></div>
                  <div className="flow-node-progress"><span style={{ width: `${dashboard?.total ? Math.min(100, (dashboard.byStatus?.Done || 0) / dashboard.total * 100) : 0}%` }} /></div>
                </article>
              </div>
            </div>
            <div className="flow-panel-footer"><div className="flow-team-stack">{members.slice(0, 4).map((m, i) => <span className={`avatar avatar-tone-${i % 4}`} key={idOf(m) || m.email} title={m.name}>{initials(m.name)}</span>)}{members.length === 0 && <span className="flow-team-empty">+</span>}</div><span><b>{members.length} {members.length === 1 ? "person" : "people"}</b> connected to this project</span><div className="flow-footer-progress"><span>Completion</span><b>{progress}%</b><div><span style={{ width: `${progress}%` }} /></div></div></div>
          </section>
          <section className="stat-grid"><StatCard icon="▧" label="Total tasks" value={dashboard?.total ?? "—"} detail={`${activeProjects} ${activeProjects === 1 ? "project" : "projects"} in workspace`} tone="violet"/><StatCard icon="◉" label="In progress" value={dashboard?.byStatus?.["In Progress"] ?? "—"} detail={`${dashboard?.byStatus?.["To Do"] || 0} ready to start`} tone="blue"/><StatCard icon="◷" label="Overdue" value={dashboard?.overdue ?? "—"} detail={dashboard?.overdue ? "Needs a little attention" : "You're all caught up"} tone="rose"/><StatCard icon="✓" label="Assigned to me" value={dashboard?.assignedToMe ?? "—"} detail={`${progress}% of project complete`} tone="green"/></section>
          <section className="content-grid"><div className="panel progress-panel"><div className="panel-header"><div><span className="panel-eyebrow">PROJECT HEALTH</span><h3>Progress overview</h3></div><button className="panel-action" onClick={() => { setView("list"); document.getElementById("tasks-section")?.scrollIntoView({ behavior: "smooth" }); }}>View tasks <span>↗</span></button></div><div className="progress-overview"><div className="donut-wrap"><svg viewBox="0 0 120 120" className="donut-chart" aria-label={`${progress}% of tasks done`}><circle cx="60" cy="60" r="46" className="donut-track"/><circle cx="60" cy="60" r="46" className="donut-value" style={{ strokeDasharray: `${progress * 2.89} 289` }}/></svg><div className="donut-center"><b>{progress}%</b><small>complete</small></div></div><div className="progress-stats">{STATUSES.map((s) => <div className="progress-status" key={s}><span className={`status-dot status-${slug(s)}`}/><span>{s}</span><b>{dashboard?.byStatus?.[s] || 0}</b></div>)}</div></div><div className="panel-footnote"><span className="footnote-spark">✦</span> Keep your momentum going — every task counts.</div></div>
            <div className="panel activity-panel"><div className="panel-header"><div><span className="panel-eyebrow">THE LATEST</span><h3>Recent activity</h3></div><span className="live-indicator"><i/> LIVE FEED</span></div>{dashboard?.activity?.length ? <div className="activity-list">{dashboard.activity.slice(0, 5).map((item) => <ActivityRow activity={item} key={item._id}/>)}</div> : <div className="empty-activity"><div>✳</div><b>Your story starts here</b><p>Project updates will appear as your team works.</p></div>}<button className="activity-bottom-link" onClick={() => showToast("Recent project activity is shown here as updates happen.")}>Activity updates <span>↗</span></button></div></section>

          <section id="tasks-section" className="panel tasks-panel"><div className="tasks-header"><div><span className="panel-eyebrow">MAKE IT HAPPEN</span><h3>Tasks <span className="task-count-pill">{pagination.total}</span></h3></div><div className="view-switch"><button className={view === "board" ? "active" : ""} onClick={() => setView("board")}><span>⊞</span> Board</button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><span>☷</span> List</button></div></div>
            <div className="task-toolbar"><label className="search-box"><span>⌕</span><input aria-label="Search tasks" placeholder="Search tasks..." value={search} onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}/><kbd>⌘ K</kbd></label><div className="filter-controls"><select aria-label="Filter by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}><option value="all">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select><select aria-label="Filter by priority" value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}><option value="all">All priorities</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select><select aria-label="Filter by assignee" value={assigneeFilter} onChange={(e) => { setAssigneeFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}><option value="all">All assignees</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>{members.map((m) => <option key={idOf(m)} value={idOf(m)}>{m.name}</option>)}</select><select aria-label="Sort tasks" value={`${sortBy}:${sortOrder}`} onChange={(e) => { const [s, o] = e.target.value.split(":"); setSortBy(s); setSortOrder(o); }}><option value="createdAt:desc">Newest first</option><option value="createdAt:asc">Oldest first</option><option value="dueDate:asc">Due date ↑</option><option value="dueDate:desc">Due date ↓</option><option value="priority:desc">Priority: high first</option><option value="priority:asc">Priority: low first</option></select><label className={`overdue-toggle ${overdueOnly ? "checked" : ""}`}><input type="checkbox" checked={overdueOnly} onChange={(e) => { setOverdueOnly(e.target.checked); setPagination((p) => ({ ...p, page: 1 })); }}/> Overdue</label><button className="button primary compact" onClick={() => openCreateTask()}><span>＋</span> Add task</button></div></div>
            {loadingTasks && <div className="inline-loading"><span className="spinner dark"/> Syncing your work…</div>}
            {view === "board" ? <div className="kanban-board">{STATUSES.map((status) => <div className="kanban-column" key={status}><div className="kanban-column-head"><span className={`status-dot status-${slug(status)}`}/><b>{status}</b><span className="column-count">{dashboard?.byStatus?.[status] ?? tasks.filter((t) => t.status === status).length}</span><button className="tiny-icon" title={`Add ${status} task`} onClick={() => { setTaskStatus(status); openCreateTask(); setTaskStatus(status); }}>＋</button></div><div className="kanban-cards">{tasks.filter((t) => t.status === status).map((task, index) => <TaskCard key={task._id} task={task} index={index} onOpen={() => void openDetails(task)} onEdit={(isOwner || idOf(task.creator) === (user.id || user._id)) ? () => openCreateTask(task) : undefined} onStatus={(next) => void changeStatus(task, next)}/>)}</div><button className="add-card-link" onClick={() => { openCreateTask(); setTaskStatus(status); }}>＋ Add a task</button></div>)}</div> : <div className="table-wrap"><table className="task-table"><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due date</th><th/></tr></thead><tbody>{tasks.map((task) => <tr key={task._id}><td><button className="task-table-title" onClick={() => void openDetails(task)}><span className="table-check">{task.status === "Done" ? "✓" : ""}</span><span><b>{task.title}</b><small>{task.description || "No description"}</small></span></button></td><td><select className={`table-status status-text-${slug(task.status)}`} aria-label={`Status for ${task.title}`} value={task.status} onChange={(e) => void changeStatus(task, e.target.value as Status)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td><td><span className={`priority-pill priority-${task.priority.toLowerCase()}`}><i/> {task.priority}</span></td><td><span className="table-assignee"><span className="avatar tiny-avatar">{initials(nameOf(task.assignee, "Unassigned"))}</span>{nameOf(task.assignee)}</span></td><td className={isOverdue(task) ? "overdue-date" : ""}>{dateLabel(task.dueDate)}</td><td>{(isOwner || idOf(task.creator) === (user.id || user._id)) && <button className="tiny-icon" aria-label={`Edit ${task.title}`} onClick={() => openCreateTask(task)}>•••</button>}</td></tr>)}</tbody></table>{tasks.length === 0 && <EmptyTasks onCreate={() => openCreateTask()}/>}</div>}
            <div className="pagination"><span>Showing <b>{tasks.length ? (pagination.page - 1) * pagination.limit + 1 : 0}–{Math.min(pagination.page * pagination.limit, pagination.total)}</b> of <b>{pagination.total}</b> tasks</span><div><button disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>← Previous</button><span className="page-number">{pagination.page} / {pagination.pages}</span><button disabled={pagination.page >= pagination.pages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>Next →</button></div></div>
          </section>
        </>}
        <footer className="app-footer"><span>✳ TeamFlow <b>·</b> Make good work together.</span><span><i/> All changes are synced</span></footer>
      </div>
    </main>

    {modal === "task" && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal-card modal-wide" role="dialog" aria-modal="true" aria-labelledby="task-modal-title"><div className="modal-top"><div><span className="modal-eyebrow">{editTask ? "TASK DETAILS" : "NEW TASK"}</span><h2 id="task-modal-title">{editTask ? "Make an update" : "Add to the plan"}</h2><p>{editTask ? "Keep your team in the loop on progress." : "A little clarity goes a long way."}</p></div><button className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog">×</button></div><form onSubmit={submitTask} className="modal-form"><label>Task title <span className="required-mark">*</span><input autoFocus value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required maxLength={150} placeholder="e.g. Review the new onboarding flow"/></label><label>Description <span className="optional-label">OPTIONAL</span><textarea rows={3} value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} maxLength={5000} placeholder="Add context, links, or what done looks like…"/></label><div className="form-row"><label>Status<select value={taskStatus} onChange={(e) => setTaskStatus(e.target.value as Status)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label><label>Priority<select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as Priority)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></label></div><div className="form-row"><label>Due date<input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)}/></label><label>Assignee {isOwner ? <span className="optional-label">OPTIONAL</span> : <span className="optional-label">OWNER ONLY</span>}<select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} disabled={!isOwner}><option value="">Unassigned</option>{members.map((m) => <option value={idOf(m)} key={idOf(m)}>{m.name}</option>)}</select></label></div><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={busy || !taskTitle.trim()}>{busy ? <span className="spinner"/> : null}{editTask ? "Save changes" : "Create task"}<span>↗</span></button></div></form></section></div>}

    {modal === "project" && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="project-modal-title"><div className="modal-top"><div><span className="modal-eyebrow">PROJECT SPACE</span><h2 id="project-modal-title">{project ? "Project settings" : "Create a project"}</h2><p>Give your team a clear place to do their best work.</p></div><button className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog">×</button></div><form onSubmit={submitProject} className="modal-form"><label>Project name <span className="required-mark">*</span><input value={projectName} onChange={(e) => setProjectName(e.target.value)} required maxLength={100} placeholder="e.g. Website refresh"/></label><label>Description <span className="optional-label">OPTIONAL</span><textarea rows={4} value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} maxLength={2000} placeholder="What are we building together?"/></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={busy || !projectName.trim()}>{busy ? <span className="spinner"/> : null}{project ? "Save settings" : "Create project"}<span>↗</span></button></div></form></section></div>}

    {modal === "members" && project && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="members-modal-title"><div className="modal-top"><div><span className="modal-eyebrow">BETTER TOGETHER</span><h2 id="members-modal-title">People on this project</h2><p>Add registered TeamFlow users and manage access.</p></div><button className="modal-close" onClick={() => setModal(null)} aria-label="Close dialog">×</button></div>{isOwner && <form className="member-add-form" onSubmit={addMember}><input aria-label="Teammate email address" type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="teammate@company.com" required/><button className="button primary compact" disabled={busy}>Invite</button></form>}<div className="member-modal-list">{members.map((m, i) => <div className="member-modal-row" key={idOf(m)}><div className={`avatar avatar-tone-${i % 4}`}>{initials(m.name)}</div><div className="member-modal-name"><b>{m.name}</b><small>{m.email}</small></div>{idOf(m) === idOf(project.owner) ? <span className="owner-pill">Owner</span> : isOwner ? <button className="member-remove" onClick={() => void removeMember(m)} title={`Remove ${m.name}`}>Remove</button> : <span className="member-role">Member</span>}</div>)}</div><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Done</button></div></section></div>}

    {detailTask && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailTask(null); }}><section className="modal-card detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-task-title"><div className="modal-top"><div><span className="modal-eyebrow">TASK / {detailTask._id.slice(-5).toUpperCase()}</span><h2 id="detail-task-title">{detailTask.title}</h2><p>{detailTask.description || "No description has been added yet."}</p></div><button className="modal-close" onClick={() => setDetailTask(null)} aria-label="Close dialog">×</button></div><div className="detail-meta-grid"><div><small>STATUS</small><select value={detailTask.status} onChange={(e) => { const next = e.target.value as Status; void changeStatus(detailTask, next); setDetailTask({ ...detailTask, status: next, version: detailTask.version + 1 }); }}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div><div><small>PRIORITY</small><span className={`priority-pill priority-${detailTask.priority.toLowerCase()}`}><i/>{detailTask.priority}</span></div><div><small>ASSIGNEE</small><span>{nameOf(detailTask.assignee)}</span></div><div><small>DUE DATE</small><span>{dateLabel(detailTask.dueDate)}</span></div></div><div className="detail-actions">{(isOwner || idOf(detailTask.creator) === (user.id || user._id)) && <button className="button secondary" onClick={() => { setDetailTask(null); openCreateTask(detailTask); }}>✎ Edit task</button>}{(isOwner || idOf(detailTask.creator) === (user.id || user._id)) && <button className="button danger-ghost" onClick={() => void deleteTask(detailTask)}>Delete</button>}</div><div className="comments-section"><div className="comments-heading"><h3>Conversation</h3><span>{comments.length} {comments.length === 1 ? "comment" : "comments"}</span></div><div className="comment-list">{comments.map((comment) => <div className="comment-row" key={comment._id}><div className="avatar tiny-avatar">{initials(comment.authorName)}</div><div className="comment-body"><div><b>{comment.authorName}</b><small>{timestamp(comment.createdAt)}</small>{(comment.author === (user.id || user._id) || isOwner) && <button onClick={() => void deleteComment(comment)} aria-label="Delete comment">×</button>}</div><p>{comment.body}</p></div></div>)}{comments.length === 0 && <div className="comment-empty">No comments yet. Start the conversation.</div>}</div><form className="comment-form" onSubmit={submitComment}><div className="avatar tiny-avatar current-avatar">{initials(user.name)}</div><input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Leave a helpful comment…" maxLength={3000} required/><button className="button primary compact" disabled={commentBusy || !commentText.trim()}>{commentBusy ? <span className="spinner"/> : "Send ↗"}</button></form></div></section></div>}

    {message && <div className={`toast ${messageType}`} role="status"><span>{messageType === "error" ? "!" : "✓"}</span>{message}<button aria-label="Dismiss notification" onClick={() => setMessage("")}>×</button></div>}
  </div>;
}

function getGreeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }
function slug(value: string) { return value.toLowerCase().replace(/\s+/g, "-"); }
function StatCard({ icon, label, value, detail, tone }: { icon: string; label: string; value: string | number; detail: string; tone: string }) { return <div className="stat-card"><div className="stat-card-top"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-more">•••</span></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>; }
function ActivityRow({ activity }: { activity: Activity }) { const labels: Record<string, string> = { "task.created": "created a task", "task.deleted": "deleted a task", "task.status_changed": "updated task status", "task.assignee_changed": "changed the assignee", "member.added": "added a teammate", "member.removed": "removed a teammate", "project.created": "created this project" }; return <div className="activity-row"><div className={`activity-type activity-${activity.action.startsWith("member") ? "member" : activity.action.includes("deleted") ? "delete" : activity.action.includes("status") ? "status" : "task"}`}>{activity.action.startsWith("member") ? "♙" : activity.action.includes("deleted") ? "−" : activity.action.includes("status") ? "↻" : "✓"}</div><div className="activity-content"><p><b>{activity.actorName}</b> {labels[activity.action] || "updated the project"}</p><small>{activity.targetLabel}</small></div><time>{timeAgo(activity.createdAt)}</time></div>; }
function timeAgo(value: string) { const diff = Date.now() - new Date(value).getTime(); if (diff < 60000) return "now"; if (diff < 3600000) return `${Math.floor(diff / 60000)}m`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`; return `${Math.floor(diff / 86400000)}d`; }
function TaskCard({ task, index, onOpen, onEdit, onStatus }: { task: Task; index: number; onOpen: () => void; onEdit?: () => void; onStatus: (s: Status) => void }) { return <article className="task-card" style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}><div className="task-card-top"><span className={`priority-pill priority-${task.priority.toLowerCase()}`}><i/>{task.priority}</span>{onEdit && <button className="task-more" title="Edit task" onClick={onEdit}>•••</button>}</div><button className="task-card-title" onClick={onOpen}>{task.title}</button>{task.description && <p className="task-card-description">{task.description}</p>}<div className="task-card-meta"><span className={`task-due ${isOverdue(task) ? "overdue-date" : ""}`}><span>◷</span>{dateLabel(task.dueDate)}</span><span className="avatar task-avatar" title={nameOf(task.assignee)}>{initials(nameOf(task.assignee))}</span></div><div className="task-card-bottom"><select aria-label={`Change ${task.title} status`} value={task.status} onChange={(e) => onStatus(e.target.value as Status)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select><button className="open-task-link" onClick={onOpen}>Details ↗</button></div></article>; }
function EmptyTasks({ onCreate }: { onCreate: () => void }) { return <div className="empty-tasks"><div>✳</div><b>No tasks match your filters</b><p>Try a different search or create a fresh task.</p><button className="button secondary" onClick={onCreate}>＋ Create a task</button></div>; }
