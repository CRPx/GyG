let tasks = [];
let editingId = null;

const taskForm = document.getElementById('taskForm');
const tasksGrid = document.getElementById('tasksGrid');
const filterEmpresa = document.getElementById('filterEmpresa');
const filterEstatus = document.getElementById('filterEstatus');
const editForm = document.getElementById('editForm');
const editModal = document.getElementById('editModal');

async function loadTasks() {
  try {
    const res = await fetch('/api/solicitudes');
    const data = await res.json();

    tasks = data.map(item => ({
      id: item.id,
      date: formatDateForInput(item.fecha),
      empresa: item.empresa,
      pendientes: item.pendientes,
      observaciones: item.observaciones || '',
      estatus: item.estatus
    }));

    renderTasks();
    updateStats();
    updateFilterOptions();
  } catch (error) {
    console.error('Error al cargar solicitudes:', error);
    alert('No se pudieron cargar las solicitudes');
  }
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

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const newTask = {
    fecha: document.getElementById('date').value,
    empresa: document.getElementById('empresa').value,
    pendientes: document.getElementById('pendientes').value,
    observaciones: document.getElementById('observaciones').value,
    estatus: document.getElementById('estatus').value
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
  const filterFechaValue = filterFecha.value;
  const filterEmpresaValue = filterEmpresa.value;
  const filterEstatusValue = filterEstatus.value;

  let filtered = tasks.filter(task => {
    const fechaMatch = !filterFechaValue || task.date === filterFechaValue;
    const empresaMatch = !filterEmpresaValue || task.empresa === filterEmpresaValue;
    const estatusMatch = !filterEstatusValue || task.estatus === filterEstatusValue;

    return fechaMatch && empresaMatch && estatusMatch;
  });

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

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
    const statusClass = `status-${task.estatus.toLowerCase().replace(/\s+/g, '-')}`;
    const headerClass = `header-${task.estatus.toLowerCase().replace(/\s+/g, '-')}`;
    const formattedDate = getFormattedDate(task.date);

    const statusEmoji = {
      'Pendiente': '🔴',
      'En proceso': '🟡',
      'Completado': '🟢'
    };

    const card = document.createElement('div');
    card.className = `task-card ${statusClass}`;

    card.innerHTML = `
      <div class="task-header ${headerClass}">
        <div><strong>${task.empresa}</strong></div>
        <div class="task-date">${formattedDate}</div>
      </div>
      <div class="task-body">
        <div class="task-field">
          <div class="task-field-label">Detalles del Trabajo</div>
          <div class="task-field-value">${escapeHtml(task.pendientes)}</div>
        </div>
        ${task.observaciones ? `
        <div class="task-field">
          <div class="task-field-label">Observaciones</div>
          <div class="task-field-value">${escapeHtml(task.observaciones)}</div>
        </div>` : ''}
        <div class="task-field">
          <div class="task-field-label">Estatus</div>
          <span class="status-badge ${statusClass}">
            ${statusEmoji[task.estatus]} ${task.estatus}
          </span>
        </div>
      </div>
      <div class="task-actions">
        <button class="btn-small btn-edit" onclick="openEditModal(${task.id})">Editar</button>
        <button class="btn-small btn-delete" onclick="deleteTask(${task.id})">Eliminar</button>
      </div>
    `;

    tasksGrid.appendChild(card);
  });
}


function updateStats() {
  const total = tasks.length;
  const pendientes = tasks.filter(t => t.estatus === 'Pendiente').length;
  const enProceso = tasks.filter(t => t.estatus === 'En proceso').length;
  const completados = tasks.filter(t => t.estatus === 'Completado').length;

  document.getElementById('totalCount').textContent = total;
  document.getElementById('pendienteCount').textContent = pendientes;
  document.getElementById('enProcesoCount').textContent = enProceso;
  document.getElementById('completadoCount').textContent = completados;
}

function updateFilterOptions() {
  const empresas = [...new Set(tasks.map(t => t.empresa))].sort();
  const currentValue = filterEmpresa.value;

  filterEmpresa.innerHTML = `<option value="">Todas las Empresas</option>`;

  empresas.forEach(empresa => {
    const option = document.createElement('option');
    option.value = empresa;
    option.textContent = empresa;
    filterEmpresa.appendChild(option);
  });

  filterEmpresa.value = currentValue;
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
    estatus: document.getElementById('editEstatus').value
  };

  try {
    const res = await fetch(`/api/solicitudes/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTask)
    });

    if (!res.ok) {
      throw new Error('Error al actualizar');
    }

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
      method: 'DELETE'
    });

    if (!res.ok) {
      throw new Error('Error al eliminar');
    }

    await loadTasks();
  } catch (error) {
    console.error('Error al eliminar solicitud:', error);
    alert('No se pudo eliminar la solicitud');
  }
}

function exportData() {
  window.location.href = '/api/exportar-excel';
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clearFilters() {
  filterFecha.value = '';
  filterEmpresa.value = '';
  filterEstatus.value = '';
  renderTasks();
}

filterFecha.addEventListener('change', renderTasks);
filterEmpresa.addEventListener('change', renderTasks);
filterEstatus.addEventListener('change', renderTasks);

window.addEventListener('click', (e) => {
  if (e.target === editModal) {
    closeModal();
  }
});

document.getElementById('date').valueAsDate = new Date();
loadTasks();

window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.deleteTask = deleteTask;
window.exportData = exportData;
window.clearFilters = clearFilters;
