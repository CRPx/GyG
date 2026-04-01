let tasks = [];
let editingId = null;
let expandedTaskId = null;

const taskForm = document.getElementById('taskForm');
const tasksGrid = document.getElementById('tasksGrid');
const filterEmpresa = document.getElementById('filterEmpresa');
const filterEstatus = document.getElementById('filterEstatus');
const editForm = document.getElementById('editForm');
const editModal = document.getElementById('editModal');
const filterFecha = document.getElementById('filterFecha');
const filterResponsable = document.getElementById('filterResponsable');

async function loadUsers() {
  try {
    const res = await fetch('/api/usuarios', { credentials: 'include' });
    const users = await res.json();
    // Llenar select del formulario
    const select = document.getElementById('responsable');
    if (select) {
      select.innerHTML = '<option value="">Selecciona un responsable</option>';
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.usuario;
        select.appendChild(option);
      });
    }
    // Llenar select del modal
    const editSelect = document.getElementById('editResponsable');
    if (editSelect) {
      editSelect.innerHTML = '<option value="">Selecciona un responsable</option>';
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.usuario;
        editSelect.appendChild(option);
      });
    }
    // Guardar lista para usar en la tabla de estadísticas (opcional)
    window.usersList = users;
  } catch (error) {
    console.error('Error al cargar usuarios:', error);
  }
}

async function loadResponsablesFilter() {
  try {
    const res = await fetch('/api/responsables', { credentials: 'include' });
    const responsables = await res.json();
    filterResponsable.innerHTML = '<option value="">Responsable</option>';
    responsables.forEach(resp => {
      const option = document.createElement('option');
      option.value = resp.id;
      option.textContent = resp.usuario;
      filterResponsable.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar responsables:', error);
  }
}

async function loadTasks() {
  try {
    const res = await fetch('/api/solicitudes', {
      credentials: 'include',
      headers: { 'Cache-Control': 'no-cache' }
    });
    const data = await res.json();

    tasks = data.map(item => ({
      id: item.id,
      date: formatDateForInput(item.fecha),
      createdAt: item.creado_en,
      empresa: item.empresa,
      pendientes: item.pendientes,
      observaciones: item.observaciones || '',
      estatus: item.estatus,
      responsable_id: item.responsable_id,
      responsable_nombre: item.responsable_nombre || 'Sin asignar',
      creador_nombre: item.creador_nombre || 'Sistema',   // ← agregar
      respuestas: Array.isArray(item.respuestas) ? item.respuestas : []
    }));

    renderTasks();
    updateStats();
    loadResponsablesFilter(); // ya lo tienes
  } catch (error) {
    console.error('Error al cargar solicitudes:', error);
    alert('No se pudieron cargar las solicitudes');
  }
}

function toggleTaskDetails(id) {
  expandedTaskId = expandedTaskId === id ? null : id;
  renderTasks();
}

function formatDateForInput(value) {
  if (!value) return '';
  if (typeof value === 'string' && value.includes('T')) {
    return value.split('T')[0];
  }
  return String(value).slice(0, 10);
}

function getFormattedDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getFormattedDateTime(value) {
  if (!value) return '';

  const date = new Date(value);

  const hora = date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const fecha = date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return `${hora}, ${fecha}`;
}

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const newTask = {
    fecha: document.getElementById('date').value,
    empresa: document.getElementById('empresa').value,
    pendientes: document.getElementById('pendientes').value,
    observaciones: document.getElementById('observaciones').value,
    estatus: document.getElementById('estatus').value,
    responsable_id: document.getElementById('responsable').value || null
  };

  try {
    const res = await fetch('/api/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask)
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error('Error backend:', data);
      alert(data?.detalle || data?.error || 'No se pudo guardar la solicitud');
      return;
    }

    taskForm.reset();
    document.getElementById('date').valueAsDate = new Date();
    await loadTasks();
  } catch (error) {
    console.error('Error al guardar solicitud:', error);
    alert(`${error.name}: ${error.message}`);
  }
});

function renderTasks() {
  const filterFechaValue = filterFecha?.value || '';
  const filterResponsableValue = filterResponsable.value;
  const filterEstatusValue = filterEstatus.value;

  let filtered = tasks.filter(task => {
    const fechaMatch = !filterFechaValue || task.date === filterFechaValue;
    const responsableMatch = !filterResponsableValue || task.responsable_id == filterResponsableValue;
    const estatusMatch = !filterEstatusValue || task.estatus === filterEstatusValue;
    return fechaMatch && responsableMatch && estatusMatch;   // ← cambiar empresaMatch por responsableMatch
  });

  filtered.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

  tasksGrid.innerHTML = '';

  if (filtered.length === 0) {
    tasksGrid.innerHTML = `
      <div class="empty-state no-tasks">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">No hay pendientes con los filtros seleccionados</div>
      </div>
    `;
    return;
  }

  filtered.forEach(task => {
    const isExpanded = expandedTaskId === task.id;
    const statusClass = `status-${task.estatus.toLowerCase().replace(/\s+/g, '-')}`;
    const headerClass = `header-${task.estatus.toLowerCase().replace(/\s+/g, '-')}`;
    const formattedCreatedAt = getFormattedDateTime(task.createdAt);

    const statusEmoji = {
      'Pendiente': '🔴',
      'En proceso': '🟡',
      'Completado': '🟢'
    };

    const responsesHtml = task.respuestas && task.respuestas.length
      ? task.respuestas.map(item => `
          <div class="response-item">
            <div class="response-meta">${getFormattedDateTime(item.creado_en)} por ${escapeHtml(item.usuario_nombre || 'Desconocido')}</div>
            <div class="response-text">${escapeHtml(item.respuesta)}</div>
          </div>
        `).join('')
      : `<div class="response-empty">No hay respuestas aún</div>`;

    const card = document.createElement('div');
    card.className = `task-card ${statusClass} ${isExpanded ? 'expanded' : ''}`;

    card.innerHTML = `
      <div class="task-header ${headerClass}">
        <div class="task-company">${escapeHtml(task.empresa)}</div>
        <div class="task-meta" style="font-size: 12px; color: rgba(255,255,255,0.8); margin-top: 4px;">
          Creado por ${escapeHtml(task.creador_nombre)}
        </div>
        <div class="task-date">${formattedCreatedAt}</div>
      </div>

      <div class="task-body">
        <div class="task-preview">
          <div class="task-field">
            <div class="task-field-label">Detalles del Trabajo</div>
            <div class="task-field-value">${escapeHtml(task.pendientes)}</div>
          </div>
          <div class="task-field">
            <div class="task-field-label">Responsable</div>
            <div class="task-field-value">${escapeHtml(task.responsable_nombre)}</div>
          </div>
        </div>

        <div class="task-extra">
          <div class="task-field">
            <div class="task-field-label">Observaciones</div>
            <div class="task-field-value">
              ${task.observaciones ? escapeHtml(task.observaciones) : 'Sin observaciones'}
            </div>
          </div>

          <div class="task-field">
            <div class="task-field-label">Respuestas</div>
            <div class="task-field-value responses-box">
              ${responsesHtml}
            </div>
          </div>

          <div class="task-field">
            <div class="task-field-label">Agregar respuestas</div>
            <div class="response-form" onclick="event.stopPropagation()">
              <textarea
                id="responseInput-${task.id}"
                class="response-textarea"
                placeholder="Escribe una respuesta para este pendiente..."
              ></textarea>
              <button
                class="btn-small btn-edit"
                onclick="event.stopPropagation(); addResponse(${task.id})"
              >
                Guardar respuesta
              </button>
            </div>
          </div>

          <div class="task-field">
            <div class="task-field-label">Estatus</div>
            <span class="status-badge ${statusClass}">
              ${statusEmoji[task.estatus]} ${task.estatus}
            </span>
          </div>

          <div class="task-actions" onclick="event.stopPropagation()">
            <button
              class="btn-small btn-edit"
              onclick="event.stopPropagation(); openEditModal(${task.id})"
            >
              Editar
            </button>

            <button
              class="btn-small btn-delete"
              onclick="event.stopPropagation(); deleteTask(${task.id})"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => toggleTaskDetails(task.id));
    tasksGrid.appendChild(card);
  });
}

async function addResponse(taskId) {
  const input = document.getElementById(`responseInput-${taskId}`);
  if (!input) return;

  const respuesta = input.value.trim();

  if (!respuesta) {
    alert('Escribe una respuesta antes de guardar.');
    return;
  }

  try {
    const res = await fetch(`/api/solicitudes/${taskId}/respuestas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuesta })
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      alert(data?.detalle || data?.error || 'No se pudo guardar la respuesta');
      return;
    }

    await loadTasks();
    expandedTaskId = taskId;
    renderTasks();
  } catch (error) {
    console.error('Error al guardar respuesta:', error);
    alert('No se pudo guardar la respuesta');
  }
}

function updateStats() {
  const statsByUser = {};
  tasks.forEach(task => {
    const userId = task.responsable_id;
    const userName = task.responsable_nombre;
    if (!userId) return; // si no tiene asignado, lo omitimos (puedes decidir si mostrarlo como "Sin asignar")
    if (!statsByUser[userId]) {
      statsByUser[userId] = {
        nombre: userName,
        total: 0,
        pendiente: 0,
        enProceso: 0,
        completado: 0
      };
    }
    statsByUser[userId].total++;
    if (task.estatus === 'Pendiente') statsByUser[userId].pendiente++;
    else if (task.estatus === 'En proceso') statsByUser[userId].enProceso++;
    else if (task.estatus === 'Completado') statsByUser[userId].completado++;
  });

  const tbody = document.getElementById('statsTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    const sorted = Object.values(statsByUser).sort((a, b) => a.nombre.localeCompare(b.nombre));
    sorted.forEach(stat => {
      const row = tbody.insertRow();
      row.insertCell(0).textContent = stat.nombre;
      row.insertCell(1).textContent = stat.total;
      row.insertCell(2).textContent = stat.pendiente;
      row.insertCell(3).textContent = stat.enProceso;
      row.insertCell(4).textContent = stat.completado;
    });
  }
}

function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  editingId = id;
  document.getElementById('editDate').value = task.date;
  document.getElementById('editEmpresa').value = task.empresa;
  document.getElementById('editPendientes').value = task.pendientes;
  document.getElementById('editObservaciones').value = task.observaciones;
  document.getElementById('editEstatus').value = task.estatus;

  const editResponsableSelect = document.getElementById('editResponsable');
  if (editResponsableSelect) {
    editResponsableSelect.value = task.responsable_id || '';
  }
  editModal.style.display = 'block';

  
}

function closeModal() {
  editModal.style.display = 'none';
  editingId = null;
}

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editingId) return;

  const updatedTask = {
    fecha: document.getElementById('editDate').value,
    empresa: document.getElementById('editEmpresa').value,
    pendientes: document.getElementById('editPendientes').value,
    observaciones: document.getElementById('editObservaciones').value,
    estatus: document.getElementById('editEstatus').value,
    responsable_id: document.getElementById('editResponsable').value || null
  };

  try {
    const res = await fetch(`/api/solicitudes/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updatedTask)
    });

    if (!res.ok) throw new Error('Error al actualizar');

    closeModal();
    await loadTasks();
  } catch (error) {
    console.error('Error al actualizar solicitud:', error);
    alert('No se pudo actualizar la solicitud');
  }
});

async function deleteTask(id) {
  const confirmacion = confirm('¿Estás seguro de que deseas eliminar este pendiente?');
  if (!confirmacion) return;

  try {
    const res = await fetch(`/api/solicitudes/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!res.ok) throw new Error('Error al eliminar');

    await loadTasks();
  } catch (error) {
    console.error('Error al eliminar solicitud:', error);
    alert('No se pudo eliminar la solicitud');
  }
}

function exportData() {
  window.location.href = '/api/exportar-excel';
}

function clearFilters() {
  if (filterFecha) filterFecha.value = '';
  if (filterResponsable) filterResponsable.value = '';
  filterEstatus.value = '';
  renderTasks();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (filterFecha) filterFecha.addEventListener('change', renderTasks);
if (filterResponsable) filterResponsable.addEventListener('change', renderTasks);
filterEstatus.addEventListener('change', renderTasks);

window.addEventListener('click', (e) => {
  if (e.target === editModal) closeModal();
});

document.getElementById('date').valueAsDate = new Date();
loadTasks();
loadResponsablesFilter();
loadUsers();

window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.deleteTask = deleteTask;
window.exportData = exportData;
window.clearFilters = clearFilters;
window.addResponse = addResponse;
