let currentView = 'detail'; // 'detail' o 'list'
const toggleViewBtn = document.getElementById('toggleViewBtn');
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
const MIC_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>`;

function attachVoice(textarea, micBtn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { micBtn.style.display = 'none'; return; }

  let recognition;
  let isRecording = false;
  let baseText = '';

  function crearReconocedor() {
    const rec = new SR();
    rec.lang = 'es-MX';
    rec.continuous = false;         // se detiene después de cada pausa
    rec.interimResults = true;

    rec.onstart = () => {
      isRecording = true;
      micBtn.classList.add('mic-recording');
      micBtn.title = 'Detener dictado';
    };

    rec.onend = () => {
      // Si el usuario no ha detenido manualmente, reiniciamos automáticamente
      if (isRecording) {
        // Pequeño retardo para evitar conflictos de reinicio rápido
        setTimeout(() => {
          if (isRecording) {
            recognition = crearReconocedor();
            recognition.start();
          }
        }, 100);
      } else {
        micBtn.classList.remove('mic-recording');
        micBtn.title = 'Dictar texto por voz';
        textarea.value = textarea.value.trim();
      }
    };

    rec.onresult = (event) => {
      let interim = '';
      let newFinal = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          newFinal += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }

      // Solo añadimos el nuevo texto final si no está ya al final de baseText
      if (newFinal.trim() && !baseText.endsWith(newFinal.trim())) {
        baseText += newFinal;
      }

      textarea.value = (baseText + interim).replace(/\s+/g, ' ').trim();
    };

    rec.onerror = (e) => {
      // Errores recuperables: ignorar y reiniciar si seguimos en grabación
      if (e.error === 'no-speech' || e.error === 'aborted') {
        if (isRecording) {
          setTimeout(() => {
            if (isRecording) {
              recognition = crearReconocedor();
              recognition.start();
            }
          }, 100);
        }
        return;
      }
      console.error('Error de voz:', e.error);
      isRecording = false;
      micBtn.classList.remove('mic-recording');
    };

    return rec;
  }

  micBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isRecording) {
      // Detener definitivamente
      isRecording = false;
      if (recognition) {
        recognition.stop();
        recognition = null;
      }
      micBtn.classList.remove('mic-recording');
      micBtn.title = 'Dictar texto por voz';
      textarea.value = textarea.value.trim();
    } else {
      // Iniciar nueva sesión conservando el texto actual
      baseText = textarea.value.trim();
      if (baseText) baseText += ' ';   // espacio para separar lo nuevo
      recognition = crearReconocedor();
      recognition.start();
    }
  });
}


function initVoiceFields() {
  const pairs = [
    ['pendientes',       'mic-pendientes'],
    ['observaciones',    'mic-observaciones'],
    ['editPendientes',   'mic-editPendientes'],
    ['editObservaciones','mic-editObservaciones'],
    ['iaTextoEmpresas',    'mic-iaTextoEmpresas'],
  ];
  pairs.forEach(([taId, btnId]) => {
    const ta  = document.getElementById(taId);
    const btn = document.getElementById(btnId);
    if (ta && btn) attachVoice(ta, btn);
  });
}

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
    const res = await fetch('/api/responsables-empresas', { credentials: 'include' });
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
    const res = await fetch('/api/solicitudes-empresas', {
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
    const res = await fetch('/api/solicitudes-empresas', {
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

function toggleView() {
  const leftPanel = document.querySelector('.left-panel');
  if (currentView === 'detail') {
    currentView = 'list';
    toggleViewBtn.textContent = '🔎 Cambiar a vista detalle';
    leftPanel.classList.add('view-list');
  } else {
    currentView = 'detail';
    toggleViewBtn.textContent = '📋 Cambiar a vista lista';
    leftPanel.classList.remove('view-list');
  }
  renderTasks(); // Re-renderizar con la nueva vista
}

if (toggleViewBtn) {
  toggleViewBtn.addEventListener('click', toggleView);
}

function renderTasks() {
  const filterFechaValue = filterFecha?.value || '';
  const filterResponsableValue = filterResponsable.value;
  const filterEstatusValue = filterEstatus.value;

  let filtered = tasks.filter(task => {
    const fechaMatch = !filterFechaValue || task.date === filterFechaValue;
    const responsableMatch = !filterResponsableValue || task.responsable_id == filterResponsableValue;
    const estatusMatch = !filterEstatusValue || task.estatus === filterEstatusValue;
    return fechaMatch && responsableMatch && estatusMatch;
  });

  filtered.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

  const pendientesActivos = filtered.filter(t => t.estatus !== 'Completado');
  const completados = filtered.filter(t => t.estatus === 'Completado');

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

  if (currentView === 'list') {
    // ========== VISTA LISTA ==========
    const renderListGroup = (taskArray, container, groupTitle) => {
      if (taskArray.length === 0) return;

      const sectionTitle = document.createElement('h3');
      sectionTitle.className = 'section-title';
      sectionTitle.textContent = groupTitle;
      container.appendChild(sectionTitle);

      const groupDiv = document.createElement('div');
      groupDiv.className = 'tasks-list-group';
      container.appendChild(groupDiv);

      taskArray.forEach(task => {
        const statusClass = `status-${task.estatus.toLowerCase().replace(/\s+/g, '-')}`;
        const formattedDate = getFormattedDate(task.date);

        const item = document.createElement('div');
        item.className = `task-list-item ${statusClass}`;
        item.addEventListener('click', () => {
          // Opcional: al hacer clic se podría expandir a vista detalle o abrir modal
          // Por ahora, lo dejamos sin acción o podrías abrir el modal de edición
          openEditModal(task.id);
        });

        item.innerHTML = `
          <div style="flex:1;">
            <div class="task-list-title">${escapeHtml(task.empresa)}</div>
            <div class="task-list-meta">
              <span>📅 ${formattedDate}</span>
              <span>👤 ${escapeHtml(task.responsable_nombre)}</span>
            </div>
          </div>
          <div class="task-list-status">
            <span class="status-badge ${statusClass}">
              ${task.estatus === 'Pendiente' ? '🔴' : task.estatus === 'En proceso' ? '🟡' : '🟢'} ${task.estatus}
            </span>
          </div>
        `;

        groupDiv.appendChild(item);
      });
    };

    renderListGroup(pendientesActivos, tasksGrid, '📋 Pendientes activos');
    renderListGroup(completados, tasksGrid, '✅ Completados');
    return;
  }

    // ========== VISTA DETALLE (tarjetas expandibles) ==========
  const renderGroup = (taskArray, container, groupTitle) => {
    if (taskArray.length === 0) return;

    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'section-title';
    sectionTitle.textContent = groupTitle;
    container.appendChild(sectionTitle);

    const groupGrid = document.createElement('div');
    groupGrid.className = 'tasks-group-grid';
    container.appendChild(groupGrid);

    taskArray.forEach(task => {
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
                <div class="voice-field">
                  <textarea id="responseInput-${task.id}" class="response-textarea" placeholder="Escribe una respuesta para este pendiente..."></textarea>
                  <button type="button" class="mic-btn" id="mic-response-${task.id}" title="Dictar texto por voz">${MIC_SVG}</button>
                </div>
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
              ${task.estatus !== 'Completado' ? `
                <div class="task-actions-left">
                  ${task.estatus === 'Pendiente' ? `
                    <button class="btn-small btn-status" onclick="event.stopPropagation(); cambiarEstatus(${task.id}, 'En proceso')">🟡 En proceso</button>
                    <button class="btn-small btn-status" onclick="event.stopPropagation(); cambiarEstatus(${task.id}, 'Completado')">🟢 Completado</button>
                  ` : ''}
                  ${task.estatus === 'En proceso' ? `
                    <button class="btn-small btn-status" onclick="event.stopPropagation(); cambiarEstatus(${task.id}, 'Pendiente')">🔴 Pendiente</button>
                    <button class="btn-small btn-status" onclick="event.stopPropagation(); cambiarEstatus(${task.id}, 'Completado')">🟢 Completado</button>
                  ` : ''}
                </div>
              ` : ''}
              <div class="task-actions-right">
                <button class="btn-small btn-edit" onclick="event.stopPropagation(); openEditModal(${task.id})">Editar</button>
                <button class="btn-small btn-delete" onclick="event.stopPropagation(); deleteTask(${task.id})">Eliminar</button>
              </div>
            </div>
          </div>
        </div>
      `;

      card.addEventListener('click', () => toggleTaskDetails(task.id));
      groupGrid.appendChild(card);

      if (isExpanded) {
        const responseTa  = card.querySelector(`#responseInput-${task.id}`);
        const responseMic = card.querySelector(`#mic-response-${task.id}`);
        if (responseTa && responseMic) attachVoice(responseTa, responseMic);
      }
    });
  };

  // Renderizar grupo de pendientes activos (no completados)
  renderGroup(pendientesActivos, tasksGrid, '📋 Pendientes activos');

  // Renderizar grupo de completados
  renderGroup(completados, tasksGrid, '✅ Completados');
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
    const res = await fetch(`/api/solicitudes-empresas/${taskId}/respuestas`, {
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

async function cambiarEstatus(id, nuevoEstatus) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  try {
    const res = await fetch(`/api/solicitudes-empresas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        fecha: task.date,
        empresa: task.empresa,
        pendientes: task.pendientes,
        observaciones: task.observaciones,
        estatus: nuevoEstatus,
        responsable_id: task.responsable_id
      })
    });

    if (!res.ok) throw new Error('Error al actualizar estatus');
    await loadTasks();
  } catch (error) {
    console.error('Error al cambiar estatus:', error);
    alert('No se pudo actualizar el estatus');
  }
}

window.cambiarEstatus = cambiarEstatus;

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
    const res = await fetch(`/api/solicitudes-empresas/${editingId}`, {
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
    const res = await fetch(`/api/solicitudes-empresas/${id}`, {
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
  window.location.href = '/api/exportar-excel-empresas';
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

async function iaLlenarFormulario(tipo) {
  const textoEl = document.getElementById('iaTextoEmpresas');
  const statusEl = document.getElementById('iaStatus');
  const btn = document.querySelector('[onclick*="iaLlenarFormulario"]');

  if (!textoEl) return;
  const texto = textoEl.value.trim();
  if (!texto) {
    alert('Escribe o dicta algo primero.');
    return;
  }

  if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = '⏳ Procesando...'; }
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/ia/crear-pendiente-empresas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ texto })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error IA');

    // Llenar campos básicos
    if (data.fecha)        document.getElementById('date').value         = data.fecha;
    if (data.empresa)      document.getElementById('empresa').value      = data.empresa;
    if (data.pendientes)   document.getElementById('pendientes').value   = data.pendientes;
    if (data.observaciones !== undefined)
                           document.getElementById('observaciones').value = data.observaciones;
    if (data.estatus)      document.getElementById('estatus').value      = data.estatus;

    // 🆕 Asignar responsable si se reconoció un nombre
    if (data.responsable_nombre) {
      const responsableSelect = document.getElementById('responsable');
      const nombreBuscado = data.responsable_nombre.trim().toLowerCase();
      let encontrado = false;

      for (let opt of responsableSelect.options) {
        if (opt.text.trim().toLowerCase() === nombreBuscado) {
          responsableSelect.value = opt.value;
          encontrado = true;
          break;
        }
      }

      // Búsqueda parcial (contiene) como fallback
      if (!encontrado) {
        for (let opt of responsableSelect.options) {
          if (opt.text.trim().toLowerCase().includes(nombreBuscado)) {
            responsableSelect.value = opt.value;
            encontrado = true;
            break;
          }
        }
      }

      if (!encontrado) {
        console.warn('Responsable no encontrado en la lista:', data.responsable_nombre);
      }
    }

    textoEl.value = '';
    if (statusEl) { statusEl.textContent = '✅ Formulario llenado'; setTimeout(() => { statusEl.style.display = 'none'; }, 3000); }

  } catch (err) {
    console.error('Error IA empresas:', err);
    if (statusEl) { statusEl.textContent = '❌ Error: ' + err.message; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.getElementById('date').valueAsDate = new Date();
loadTasks();
loadResponsablesFilter();
loadUsers();
initVoiceFields();

window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.deleteTask = deleteTask;
window.exportData = exportData;
window.clearFilters = clearFilters;
window.addResponse = addResponse;
window.iaLlenarFormulario = iaLlenarFormulario;

// ── Mobile FAB toggle ──────────────────────────────────────
(function () {
  const fab       = document.getElementById('fabNew');
  const panel     = document.getElementById('rightPanel');
  const closeBtn  = document.getElementById('mobileFormClose');
  const isMobile  = () => window.innerWidth <= 768;

  function openPanel() {
    panel.classList.add('mobile-open');
    panel.style.display = '';
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    panel.classList.remove('mobile-open');
    if (isMobile()) panel.style.display = 'none';
    document.body.style.overflow = '';
  }

  if (fab) {
    fab.addEventListener('click', openPanel);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closePanel);
  }

  // Mostrar/ocultar FAB y panel según tamaño de ventana
  function handleResize() {
    if (!fab || !panel) return;
    if (isMobile()) {
      fab.style.display = 'flex';
      if (!panel.classList.contains('mobile-open')) {
        panel.style.display = 'none';
      }
    } else {
      fab.style.display = 'none';
      panel.style.display = '';
      panel.classList.remove('mobile-open');
      document.body.style.overflow = '';
    }
  }

  // Cerrar panel al guardar con éxito (cuando el form hace reset)
  const form = document.getElementById('taskForm');
  if (form) {
    form.addEventListener('reset', () => {
      if (isMobile()) closePanel();
    });
  }

  window.addEventListener('resize', handleResize);
  handleResize(); // estado inicial
})();

// ── Mobile FAB — abrir/cerrar panel de nuevo pendiente ──
const fabNew       = document.getElementById('fabNew');
const rightPanel   = document.querySelector('.right-panel');
const mobileClose  = document.getElementById('mobileFormClose');

if (fabNew && rightPanel) {
  fabNew.addEventListener('click', () => {
    rightPanel.classList.add('mobile-open');
    // Scroll al tope del panel al abrirlo
    rightPanel.scrollTop = 0;
  });
}

if (mobileClose && rightPanel) {
  mobileClose.addEventListener('click', () => {
    rightPanel.classList.remove('mobile-open');
  });
}

// Cerrar panel mobile al guardar el formulario exitosamente
const originalSubmit = taskForm.onsubmit;
taskForm.addEventListener('submit', async () => {
  // Esperar un momento a que se procese el guardado
  setTimeout(() => {
    if (rightPanel) rightPanel.classList.remove('mobile-open');
  }, 600);
});

// Inicializar acordeones desplegables
function initCollapsibleSections() {
  const headers = document.querySelectorAll('.section-header');
  headers.forEach(header => {
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const section = header.closest('.collapsible-section');
      if (section) {
        section.classList.toggle('collapsed');
        // Opcional: guardar estado en localStorage
        const targetId = header.dataset.target;
        if (targetId) {
          const isCollapsed = section.classList.contains('collapsed');
          localStorage.setItem(`collapsed_${targetId}`, isCollapsed);
        }
      }
    });
  });

  // Restaurar estado previo desde localStorage (opcional)
  document.querySelectorAll('.collapsible-section').forEach(section => {
    const header = section.querySelector('.section-header');
    if (header && header.dataset.target) {
      const targetId = header.dataset.target;
      const savedState = localStorage.getItem(`collapsed_${targetId}`);
      if (savedState === 'true') {
        section.classList.add('collapsed');
      } else if (savedState === 'false') {
        section.classList.remove('collapsed');
      }
    }
  });
}

// Llamar a la función cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  initCollapsibleSections();
});