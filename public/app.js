const courseNames = [
  'General Physics Lab', 'Thermodynamics', 'Engineering Graphics', 'Mechanics',
  'Mechanical Workshop', 'Mathematics I', 'Chemical Structure and Bonding',
  'IIT Madras — Programming with Python', 'IIT Madras — English 1'
];
const state = { view: 'todo', course: '', search: '', tasks: [], month: firstOfMonth(new Date()) };
const $ = selector => document.querySelector(selector);
const taskList = $('#task-list');
const calendarView = $('#calendar-view');
const dialog = $('#task-dialog');
const form = $('#task-form');
let toastTimer;
const pendingToggles = new Set();

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function firstOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function todayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = name => parts.find(p => p.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function formatDate(dateString, options = { month: 'short', day: 'numeric' }) {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', options);
}
function courseClass(course) { return course?.startsWith('IIT Madras') ? 'iit' : ''; }
function dueClass(task) {
  if (!task.dueDate || task.done) return '';
  if (task.dueDate < todayISO()) return 'overdue';
  const days = (Date.parse(`${task.dueDate}T00:00:00Z`) - Date.parse(`${todayISO()}T00:00:00Z`)) / 86400000;
  return days <= 2 ? 'due-soon' : '';
}
function relativeDue(dateString) {
  if (!dateString) return 'No due date';
  if (dateString === todayISO()) return 'Today';
  const tomorrow = new Date(`${todayISO()}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (dateString === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow';
  return formatDate(dateString);
}
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}
function showUndoToast(message, onUndo) {
  const toast = $('#toast');
  toast.textContent = '';
  const label = document.createElement('span');
  label.textContent = message;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Undo';
  button.className = 'toast-undo';
  button.addEventListener('click', async () => {
    toast.classList.remove('show');
    await onUndo();
  });
  toast.append(label, button);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 5000);
}
async function request(url, options) {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
function matchesView(task, view) {
  if (view === 'all') return true;
  if (view === 'done') return task.done;
  if (view === 'calendar') return true;
  return !task.done;
}
function visibleTasks() {
  const query = state.search.trim().toLocaleLowerCase();
  return state.tasks.filter(task => {
    const inView = matchesView(task, state.view);
    const inCourse = !state.course || task.course === state.course;
    const searchable = `${task.title} ${task.notes} ${task.course ?? ''}`.toLocaleLowerCase();
    return inView && inCourse && (!query || searchable.includes(query));
  });
}
function renderMetrics() {
  const open = state.tasks.filter(task => !task.done);
  const done = state.tasks.filter(task => task.done);
  $('#open-metric').textContent = open.length;
  $('#done-metric').textContent = done.length;
  $('#side-open').textContent = open.length;
  $('#side-done').textContent = done.length;
  $('#due-metric').textContent = open.filter(task => task.dueDate === todayISO()).length;
  $('#todo-count').textContent = open.length;
}
function currentViewText() {
  return ({ todo: ['To do', 'YOUR DAY, AT A GLANCE', 'A little progress adds up. Pick up where you left off.', 'Your priorities', 'Sorted by priority, then by due date'], done: ['Done', 'A LOOK BACK', 'Every finished task is a small win.', 'Completed tasks', 'Your completed work stays here for reference'], all: ['All tasks', 'YOUR WORKSPACE', 'Everything you are working on, in one place.', 'All tasks', 'Open and completed tasks'], calendar: ['Calendar', 'DATES & DEADLINES', 'Keep your upcoming work in view.', 'Your calendar', 'Tasks with due dates'] })[state.view];
}
function renderHeader() {
  const [name, eyebrow, subtitle, listTitle, caption] = currentViewText();
  $('#crumb-view').textContent = name;
  $('#page-title').textContent = state.course || name;
  $('#eyebrow').textContent = eyebrow;
  $('#page-subtitle').textContent = state.course ? 'A focused view of work for this course.' : subtitle;
  $('#list-title').textContent = state.course ? state.course : listTitle;
  $('#list-caption').textContent = state.search ? `Matching “${state.search}”` : caption;
  $('#date-stamp').textContent = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  $('#today-date').textContent = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
  document.title = `${name} · NITC HQ Tasks`;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === state.view));
}
function renderCourseNav() {
  const courseNav = $('#course-nav');
  courseNav.innerHTML = courseNames.map(course => `<button class="course-link ${courseClass(course)} ${state.course === course ? 'selected' : ''}" data-course="${escapeHTML(course)}"><i class="course-dot" aria-hidden="true"></i><span>${escapeHTML(course)}</span></button>`).join('');
}
function syncCourseSelects() {
  const filter = $('#course-filter');
  const currentFilter = filter.value;
  filter.innerHTML = `<option value="">All courses</option>${courseNames.map(course => `<option value="${escapeHTML(course)}">${escapeHTML(course)}</option>`).join('')}`;
  filter.value = courseNames.includes(currentFilter) ? currentFilter : state.course;
  const taskCourse = $('#task-course');
  const currentTaskCourse = taskCourse.value;
  taskCourse.innerHTML = courseNames.map(course => `<option value="${escapeHTML(course)}">${escapeHTML(course)}</option>`).join('');
  if (courseNames.includes(currentTaskCourse)) taskCourse.value = currentTaskCourse;
}
function taskRow(task) {
  const title = escapeHTML(task.title);
  const course = task.course ? `<span class="course-pill ${courseClass(task.course)}"><i class="course-mini-dot" aria-hidden="true"></i>${escapeHTML(task.course)}</span>` : '<span class="course-pill"><i class="course-mini-dot" aria-hidden="true"></i>Miscellaneous</span>';
  const priority = task.priority == null ? '<span class="priority-tag none">No priority</span>' : `<span class="priority-tag ${task.priority >= 9 ? 'high' : ''}">P ${task.priority}</span>`;
  return `<article class="task-row ${task.done ? 'is-done' : ''}" data-task-row="${escapeHTML(task.id)}">
    <button class="task-check" type="button" data-toggle-task="${escapeHTML(task.id)}" aria-pressed="${task.done}" aria-label="${task.done ? 'Reopen' : 'Complete'} ${title}">${task.done ? '✓' : ''}</button>
    <div class="task-main" role="button" tabindex="0" data-open-task="${escapeHTML(task.id)}" aria-label="Edit ${title}"><div class="task-title">${title}</div><div class="task-meta">${course}<span class="type-label">${escapeHTML(task.type)}</span></div></div>
    <time class="task-date ${dueClass(task)}" datetime="${escapeHTML(task.dueDate ?? '')}">${escapeHTML(relativeDue(task.dueDate))}</time>
    ${priority}
  </article>`;
}
function renderList() {
  const tasks = visibleTasks();
  $('#list-count').textContent = state.view === 'calendar' ? tasks.filter(task => task.dueDate).length : tasks.length;
  taskList.classList.toggle('done-view', state.view === 'done');
  taskList.hidden = state.view === 'calendar';
  calendarView.hidden = state.view !== 'calendar';
  if (state.view === 'calendar') { renderCalendar(tasks); return; }
  if (!tasks.length) {
    const title = state.search || state.course ? 'No tasks match this view' : state.view === 'done' ? 'Nothing completed just yet' : 'You’re all caught up';
    const description = state.search || state.course ? 'Try a different search or course filter.' : state.view === 'done' ? 'Completed tasks will stay here for your reference.' : 'Enjoy the breathing room, or add something new when you are ready.';
    taskList.innerHTML = `<div class="empty-state"><span class="empty-icon">✳</span><strong>${title}</strong><p>${description}</p></div>`;
    return;
  }
  taskList.innerHTML = tasks.map(taskRow).join('');
}
function renderCalendar(tasks) {
  const y = state.month.getFullYear();
  const m = state.month.getMonth();
  const monthName = state.month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const monthStart = new Date(y, m, 1);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(y, m, 1 - mondayOffset);
  const monthTasks = tasks.filter(task => task.dueDate && task.dueDate.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`));
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let cells = dayNames.map(day => `<div class="calendar-weekday">${day}</div>`).join('');
  for (let index = 0; index < 42; index++) {
    const date = new Date(gridStart); date.setDate(gridStart.getDate() + index);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dayTasks = monthTasks.filter(task => task.dueDate === iso);
    cells += `<div class="calendar-day ${date.getMonth() !== m ? 'muted' : ''} ${iso === todayISO() ? 'today' : ''}" role="listitem" aria-label="${escapeHTML(formatDate(iso, { month: 'long', day: 'numeric' }))}"><span class="day-number">${date.getDate()}</span>${dayTasks.map(task => `<button type="button" class="calendar-task ${courseClass(task.course)} ${task.done ? 'done' : ''}" data-open-task="${escapeHTML(task.id)}" aria-label="${escapeHTML(task.title)}${task.done ? ', completed' : ''}">${escapeHTML(task.title)}</button>`).join('')}</div>`;
  }
  calendarView.innerHTML = `<div class="calendar-head"><strong>${escapeHTML(monthName)}</strong><div class="calendar-nav"><button type="button" data-month="-1" aria-label="Previous month">‹</button><button type="button" data-month="1" aria-label="Next month">›</button></div></div><div class="calendar-grid" role="list" aria-label="${escapeHTML(monthName)} calendar">${cells}</div>`;
}
function render() { renderHeader(); renderMetrics(); renderCourseNav(); syncCourseSelects(); renderList(); }
async function loadTasks() {
  try {
    const data = await request('/api/tasks?view=all');
    state.tasks = data.tasks;
    render();
  } catch (error) { taskList.innerHTML = `<div class="empty-state"><strong>Could not load tasks</strong><p>${escapeHTML(error.message)}</p></div>`; }
}
function openTask(task = null) {
  form.reset();
  $('#form-error').hidden = true;
  $('#dialog-title').textContent = task ? 'Edit task' : 'New task';
  $('#save-task').textContent = task ? 'Save changes' : 'Save task';
  $('#task-form [name=id]').value = task?.id ?? '';
  $('#task-title').value = task?.title ?? '';
  $('#task-type').value = task?.type ?? (state.course ? 'Coursework' : 'Coursework');
  $('#task-course').value = task?.course ?? state.course ?? courseNames[0];
  $('#task-due').value = task?.dueDate ?? '';
  $('#task-priority').value = task ? (task.priority ?? '') : '5';
  $('#task-notes').value = task?.notes ?? '';
  syncCourseField();
  dialog.showModal();
  $('#task-title').focus();
}
function syncCourseField() {
  const coursework = $('#task-type').value === 'Coursework';
  $('#course-field').hidden = !coursework;
  $('#task-course').disabled = !coursework;
}
async function saveForm(event) {
  event.preventDefault();
  const id = $('#task-form [name=id]').value;
  const type = $('#task-type').value;
  const payload = {
    title: $('#task-title').value.trim(),
    type,
    course: type === 'Coursework' ? $('#task-course').value : null,
    dueDate: $('#task-due').value || null,
    priority: $('#task-priority').value ? Number($('#task-priority').value) : null,
    notes: $('#task-notes').value
  };
  try {
    await request(id ? `/api/tasks/${encodeURIComponent(id)}` : '/api/tasks', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    dialog.close();
    await loadTasks();
    showToast(id ? 'Changes saved' : 'Task added');
  } catch (error) {
    $('#form-error').textContent = error.message;
    $('#form-error').hidden = false;
  }
}
async function toggleTask(id) {
  if (pendingToggles.has(id)) return;
  const task = state.tasks.find(item => item.id === id);
  if (!task) return;
  pendingToggles.add(id);
  document.querySelectorAll(`[data-toggle-task="${CSS.escape(id)}"]`).forEach(button => { button.disabled = true; });
  try {
    await request(`/api/tasks/${encodeURIComponent(id)}/${task.done ? 'reopen' : 'complete'}`, { method: 'POST', body: '{}' });
    await loadTasks();
    if (task.done) {
      showToast('Task reopened');
    } else {
      showUndoToast('Nice work — task completed', async () => {
        try {
          await request(`/api/tasks/${encodeURIComponent(id)}/reopen`, { method: 'POST', body: '{}' });
          await loadTasks();
        } catch (error) { showToast(error.message); }
      });
    }
  } catch (error) { showToast(error.message); }
  finally {
    pendingToggles.delete(id);
    document.querySelectorAll(`[data-toggle-task="${CSS.escape(id)}"]`).forEach(button => { button.disabled = false; });
  }
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; state.course = ''; $('#course-filter').value = ''; render(); }));
$('#course-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-course]');
  if (!button) return;
  state.course = state.course === button.dataset.course ? '' : button.dataset.course;
  $('#course-filter').value = state.course;
  if (state.view === 'calendar') state.view = 'todo';
  render();
});
$('#course-filter').addEventListener('change', event => { state.course = event.target.value; if (state.view === 'calendar') state.view = 'todo'; render(); });
$('#search').addEventListener('input', event => { state.search = event.target.value; renderHeader(); renderMetrics(); renderList(); });
$('#new-task').addEventListener('click', () => openTask());
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => dialog.close()));
$('#task-type').addEventListener('change', syncCourseField);
form.addEventListener('submit', saveForm);
$('#task-priority').innerHTML = '<option value="">No priority</option>' + Array.from({ length: 10 }, (_, index) => `<option value="${index + 1}">${index + 1}${index === 9 ? ' · Highest' : index === 0 ? ' · Lowest' : ''}</option>`).join('');
document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-toggle-task]');
  if (toggle) { toggleTask(toggle.dataset.toggleTask); return; }
  const open = event.target.closest('[data-open-task]');
  if (open) { const task = state.tasks.find(item => item.id === open.dataset.openTask); if (task) openTask(task); return; }
  const month = event.target.closest('[data-month]');
  if (month) { state.month.setMonth(state.month.getMonth() + Number(month.dataset.month)); renderList(); }
});
document.addEventListener('keydown', event => {
  const target = event.target.closest('[data-open-task][role="button"]');
  if (target && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); const task = state.tasks.find(item => item.id === target.dataset.openTask); if (task) openTask(task); }
});
function maybeAutoReload() {
  if (dialog.open) return;
  loadTasks();
}
const themeButton = $('#theme-button');
const themeMenu = $('#theme-menu');
const THEME_KEY = 'nitc-theme';
const THEMES = ['white', 'midnight', 'nova'];
const LEGACY_THEMES = { system: 'white', light: 'white', dark: 'midnight', editorial: 'white' };
function storedTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY) || 'white';
    if (THEMES.includes(raw)) return raw;
    const mapped = LEGACY_THEMES[raw] || 'white';
    try { localStorage.setItem(THEME_KEY, mapped); } catch { /* private mode */ }
    return mapped;
  } catch { return 'white'; }
}
function resolveTheme(choice) {
  return THEMES.includes(choice) ? choice : 'white';
}
const themeMetaColors = { white: '#f6f4ef', midnight: '#0f141b', nova: '#f7f7f5' };
function applyTheme(choice) {
  const resolved = resolveTheme(choice);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', themeMetaColors[resolved] || '#f6f4ef');
  themeButton.textContent = resolved === 'midnight' ? '☀' : '☾';
  document.querySelectorAll('[data-theme-option]').forEach(option => option.setAttribute('aria-checked', String(option.dataset.themeOption === choice)));
}
function setThemeMenu(open) {
  themeMenu.hidden = !open;
  themeButton.setAttribute('aria-expanded', String(open));
}
themeButton.addEventListener('click', () => setThemeMenu(themeMenu.hidden));
themeMenu.addEventListener('click', event => {
  const option = event.target.closest('[data-theme-option]');
  if (!option) return;
  try { localStorage.setItem(THEME_KEY, option.dataset.themeOption); } catch { /* private mode: apply without persisting */ }
  applyTheme(option.dataset.themeOption);
  setThemeMenu(false);
  themeButton.focus();
});
document.addEventListener('click', event => {
  if (!themeMenu.hidden && !event.target.closest('.theme-wrapper')) setThemeMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !themeMenu.hidden) { setThemeMenu(false); themeButton.focus(); }
});
applyTheme(storedTheme());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') maybeAutoReload(); });
setInterval(() => { if (document.visibilityState === 'visible') maybeAutoReload(); }, 30000);
loadTasks();
